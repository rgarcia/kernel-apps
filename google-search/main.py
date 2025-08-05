import kernel
from kernel import Kernel
from patchright.async_api import async_playwright, Page, Browser
#from playwright.async_api import async_playwright, Page, Browser
from typing import TypedDict
from urllib.parse import urlparse
import time
import sys
import asyncio
import argparse

client = Kernel()

app = kernel.App("google")

def log(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def persistent_browser_id() -> str:
    return f"google"

def cleanup_search_query(query: str | None) -> str:
    if not query or not isinstance(query, str):
        raise ValueError("Query is required and must be a string")
    return query.strip()    

async def get_page(browser: Browser) -> Page:
    # Ensure there is at least one browser context; create one if necessary
    if len(browser.contexts) == 0:
        context = await browser.new_context()
    else:
        context = browser.contexts[0]
    if len(context.pages) == 0:
        return await context.new_page()
    return context.pages[0]

async def perform_search(browser: Browser, query: str) -> list[str]:
    """
    Core search routine shared by the kernel action and the CLI mode.
    It navigates to Google (if not already there), performs the search, and
    returns the visible text of each result element.
    """
    page = await get_page(browser)
    search_input_selector = 'textarea[aria-label="Search"]'

    # Navigate to Google homepage if needed
    input_exists = await page.query_selector(search_input_selector)
    url_contains_google = "google.com" in page.url if hasattr(page, "url") else False
    if not input_exists or not url_contains_google:
        await page.goto("https://www.google.com", timeout=10000)
        log("Navigated to Google homepage")
        input_exists = await page.query_selector(search_input_selector)
        if input_exists is None:
            raise Exception("Could not find search textarea on Google homepage")

    # Perform the search
    await page.fill(search_input_selector, query)
    await page.keyboard.press("Enter")
    log(f"Typed query '{query}' into the search bar and submitted")

    # Gather results
    await page.wait_for_load_state("domcontentloaded")
    await page.wait_for_selector('div.g')
    elements = await page.query_selector_all('div.g')
    texts = await asyncio.gather(*(element.text_content() for element in elements))
    return [text for text in texts if text]

class Output(TypedDict):
    success: bool
    results: list[str]
    

class SearchInput(TypedDict):
    query: str

@app.action("search")
async def search(ctx: kernel.KernelContext, input: SearchInput) -> Output:
    query = cleanup_search_query(input.get("query", ""))
    log(f"Query: {query}")
    kernel_browser = client.browsers.create(
        persistence={"id": persistent_browser_id()},
        stealth=True,
    )
    log(f"Kernel live view: {kernel_browser.browser_live_view_url}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernel_browser.cdp_ws_url)
        try:
            results = await perform_search(browser, query)
            log(f"Results: {results}")
            return {"success": True, "results": results}
        finally:
            await browser.close()

if __name__ == "__main__":
    async def _main() -> None:
        parser = argparse.ArgumentParser(description="Google search using a local browser")
        parser.add_argument("query", help="Search query to perform on Google")
        parser.add_argument(
            "--headless",
            action="store_true",
            help="Run the browser in headless mode (default is headed).",
        )
        args = parser.parse_args()

        query = cleanup_search_query(args.query)

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=args.headless)
            try:
                results = await perform_search(browser, query)
                # Print results to stdout so they can be consumed by other tools
                print(results)
            finally:
                await browser.close()

    asyncio.run(_main())
