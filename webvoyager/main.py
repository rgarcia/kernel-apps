import argparse
import asyncio
import contextlib
import logging
import os

from browser_use import Agent, BrowserSession
from browser_use.llm import ChatOpenAI
from dotenv import load_dotenv
from kernel import AsyncKernel, Kernel
from lmnr import Laminar, evaluate, observe

load_dotenv()

openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY is not set")

# Initialize logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Kernel client
client = Kernel()


# Optional override for external CDP URL (set via CLI)
OVERRIDE_CDP_URL = None


# Ensure browser-use console logs include timestamps
def _enable_browser_use_timestamps() -> None:
    try:
        bu_logger = logging.getLogger("browser_use")
        # Update console handlers on browser_use logger to include %(asctime)s
        for handler in list(getattr(bu_logger, "handlers", [])):
            if isinstance(handler, logging.StreamHandler):
                fmt = handler.formatter
                # Try to preserve BrowserUseFormatter name-cleaning if present
                try:
                    log_level = getattr(fmt, "log_level", logging.getLogger().level)
                    new_fmt = fmt.__class__(
                        "%(asctime)s - %(levelname)-8s [%(name)s] %(message)s",
                        log_level,
                    )
                    handler.setFormatter(new_fmt)
                except Exception:
                    # Fallback to a standard formatter with timestamps
                    handler.setFormatter(
                        logging.Formatter(
                            "%(asctime)s - %(levelname)-8s [%(name)s] %(message)s"
                        )
                    )

        # Apply same to bubus (event bus) so its INFO lines also get timestamps
        eb_logger = logging.getLogger("bubus")
        for handler in list(getattr(eb_logger, "handlers", [])):
            if isinstance(handler, logging.StreamHandler):
                fmt = handler.formatter
                try:
                    log_level = getattr(fmt, "log_level", logging.getLogger().level)
                    new_fmt = fmt.__class__(
                        "%(asctime)s - %(levelname)-8s [%(name)s] %(message)s",
                        log_level,
                    )
                    handler.setFormatter(new_fmt)
                except Exception:
                    handler.setFormatter(
                        logging.Formatter(
                            "%(asctime)s - %(levelname)-8s [%(name)s] %(message)s"
                        )
                    )
    except Exception:
        # Non-fatal if formatting adjustment fails
        pass


_enable_browser_use_timestamps()

# Load evaluation data from tasks.txt
data = []
with open("tasks.txt", "r", encoding="utf-8") as file:
    for line_num, line in enumerate(file.readlines(), 1):
        line = line.strip()
        if not line:  # Skip empty lines
            continue

        data.append({"data": {"task": line}})

logger.info(f"Loaded {len(data)} tasks from tasks.txt")


async def stream_kernel_logs(session_id: str) -> None:
    """
    Stream browser logs via Kernel Async API equivalent to:
    kernel browsers logs stream <session_id> --path /var/log/supervisord/kernel-images-api --source path --follow
    """
    async_client = AsyncKernel()
    stream = None
    try:
        stream = await async_client.browsers.logs.stream(
            id=session_id,
            source="path",
            path="/var/log/supervisord/kernel-images-api",
            follow=True,
        )
        async for event in stream:
            # Echo log messages
            print(event.message)
    except asyncio.CancelledError:
        if stream is not None:
            with contextlib.suppress(Exception):
                await stream.close()
        raise
    except Exception as e:
        logger.warning(f"Log stream error for session {session_id}: {e}")
    finally:
        with contextlib.suppress(Exception):
            await async_client.close()


async def _run_agent_core(data_item: dict) -> str:
    """
    Execute browser automation task using browser-use Agent with Kernel browser session
    """
    try:
        # Prepare browser session, using override CDP URL if provided
        kernel_browser = None
        if OVERRIDE_CDP_URL:
            browser_session = BrowserSession(cdp_url=OVERRIDE_CDP_URL)
        else:
            # Create Kernel browser session
            kernel_browser = client.browsers.create(timeout_seconds=10, headless=True)
            print(
                "kernel browser id",
                kernel_browser.session_id,
                kernel_browser.browser_live_view_url,
            )

            # Create browser session with Kernel CDP URL
            browser_session = BrowserSession(cdp_url=kernel_browser.cdp_ws_url)

        # Construct task prompt
        prompt = data_item["task"]
        print(prompt)

        # Start background log streaming
        # logs_task = asyncio.create_task(stream_kernel_logs(kernel_browser.session_id))

        # Create and configure agent
        agent = Agent(
            browser_session=browser_session,
            task=prompt,
            llm=ChatOpenAI(model="gpt-5", api_key=openai_api_key),
        )

        # Run the agent
        result = await agent.run()

        # Stop background log streaming
        # logs_task.cancel()
        # with contextlib.suppress(asyncio.CancelledError):
        #     await logs_task

        # Clean up browser session
        await browser_session.kill()  # this does not actually close the CDP connection
        if kernel_browser is not None:
            client.browsers.delete_by_id(kernel_browser.session_id)

        return str(result)

    except Exception as e:
        logger.error(f"Error running agent: {str(e)}")
        # Attempt to stop any running log task if defined in scope
        # if "logs_task" in locals() and logs_task is not None:
        #     logs_task.cancel()
        #     with contextlib.suppress(asyncio.CancelledError):
        #         await logs_task
        return f"Error: {str(e)}"


@observe()
async def run_agent(data_item: dict) -> str:
    return await _run_agent_core(data_item)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WebVoyager runner")
    parser.add_argument(
        "--mode",
        choices=["laminar", "direct"],
        default="laminar",
        help="Run with Laminar evaluation or direct loop",
    )
    parser.add_argument(
        "--cdp-url",
        dest="cdp_url",
        default=None,
        help=(
            "Override CDP websocket URL to connect to an existing browser. "
            "If provided, Kernel will NOT be used to allocate a browser."
        ),
    )
    return parser.parse_args()


def _run_laminar() -> None:
    Laminar.initialize(project_api_key=os.getenv("LAMINAR_API_KEY"))
    evaluate(
        data=data,
        group_name="rkim-browser-use-kernel-test",
        executor=run_agent,
        evaluators={
            "identity": lambda output, target: 1,
        },
        concurrency_limit=1,  # Lower concurrency for Kernel browser sessions
        trace_export_timeout_seconds=300,
        # Uncomment for local Laminar instance
        # base_url="http://localhost",
        # http_port=8000,
        # grpc_port=8001,
    )


async def _run_direct_async() -> None:
    for idx, item in enumerate(data, 1):
        input_item = item.get("data", {})
        logger.info(
            f"[Direct] Starting task {idx}/{len(data)}: {input_item.get('task', '')}"
        )
        result = await _run_agent_core(input_item)
        print(result)


def _run_direct() -> None:
    asyncio.run(_run_direct_async())


if __name__ == "__main__":
    args = _parse_args()
    # Apply CDP URL override if provided
    if args.cdp_url:
        OVERRIDE_CDP_URL = args.cdp_url
    if args.mode == "laminar":
        _run_laminar()
    else:
        _run_direct()
