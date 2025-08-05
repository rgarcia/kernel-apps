import kernel
from kernel import Kernel
from playwright.async_api import async_playwright, Page, Browser
from typing import TypedDict
from urllib.parse import urlparse
import time
import sys

client = Kernel()

app = kernel.App("github")

def log(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def persistent_browser_id(username: str) -> str:
    return f"github-{username}"

def cleanup_url(url: str | None) -> str:
    if not url or not isinstance(url, str):
        raise ValueError("URL is required and must be a string")
    if not url.startswith(('http://', 'https://')):
        url = f"https://{url}"
    try:
        urlparse(url)
    except Exception:
        raise ValueError(f"Invalid URL: {url}")
    return url

def cleanup_username(username: str | None) -> str:
    if not username or not isinstance(username, str) or not username.strip():
        raise ValueError("Username is required and must be a string")
    return username.strip()

async def is_logged_in(page: Page) -> bool:
    """
    Checks if the GitHub user avatar is present in the DOM.
    Modify the selector or attributes if needed.
    """
    try:
        await page.locator('header img[class*="avatar"]').first.wait_for(timeout=1000)
        return True
    except Exception:
        return False
    

async def wait_for_login(page: Page, timeout: float = 120.0, poll_interval: float = 1.0):
    """
    Polls until the login avatar appears or timeout is reached.
    """
    start_time = time.time()
    first_check = True
    while time.time() - start_time < timeout:
        if await is_logged_in(page):
            log("✅ Detected login.")
            return True
        if first_check:
            log("Go log in, please!")
            first_check = False
        time.sleep(poll_interval)
    log("❌ Login not detected within timeout.")
    return False

async def get_page(browser: Browser) -> Page:
    if len(browser.contexts) == 0:
        raise Exception("No context found")
    context = browser.contexts[0]
    if len(context.pages) == 0:
        return await context.new_page()
    return context.pages[0]

class Output(TypedDict):
    success: bool
    message: str
    

class ProvisionBrowserInput(TypedDict):
    username: str

@app.action("provision-browser")
async def provision_browser(ctx: kernel.KernelContext, input: ProvisionBrowserInput) -> Output:
    username = cleanup_username(input.get("username", ""))
    kernel_browser = client.browsers.create(
        persistence={"id": persistent_browser_id(username)}
    )
    logged_in = False
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernel_browser.cdp_ws_url)
        context = browser.contexts[0]
        if not context:
            raise Exception("No context found")
        page = context.pages[0]
        if not page:
            raise Exception("No page found")
        try:
            await page.goto("https://github.com/login", timeout=10000)
            log("Navigated to login page")
            if await is_logged_in(page):
                logged_in = True
        finally:
            await browser.close()
    if logged_in:
        return {"success": True, "message": f"Provisioned browser for {username}. It's already logged in"}
    else:
        return {"success": True, "message": f"Provisioned browser for {username}. Please go log in here: {kernel_browser.browser_live_view_url}"}

class UnwatchInput(TypedDict):
    # url to get to a github repo to unwatch
    username: str
    url: str

@app.action("unwatch")
async def unwatch(ctx: kernel.KernelContext, input: UnwatchInput) -> Output:
    url = cleanup_url(input.get("url"))
    username = cleanup_username(input.get("username", ""))
    kernel_browser = client.browsers.create(
        persistence={"id": persistent_browser_id(username)}
    )
    log(f"live view url: {kernel_browser.browser_live_view_url}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernel_browser.cdp_ws_url)
        page = get_page(browser)
                
        try:
            await page.goto(url)
            log("Checking logged in state...")
            if not await wait_for_login(page):
                return {"success": False, "message": "Login not detected within timeout."}
            log("✅ Login detected.")
            await page.goto(url)
            log(f"✅ Navigated to url: {url}")
            # Try to find the "Unwatch" span. If not found, assume already unwatched and return success.
            unwatch_found = await page.evaluate("""
                (() => {
                    const el = [...document.querySelectorAll('span')]
                      .find(el => el.textContent.trim().includes("Unwatch"));
                    if (el) {
                      el.click();
                      return true;
                    }
                    return false;
                })()
            """)
            if not unwatch_found:
                log("✅ Repo is already unwatched (no 'Unwatch' button found).")
                return {"success": True, "message": f"Repo already unwatched: {url}"}
            log("⏳ Unwatching repo...")
            await page.locator("span").filter(has_text="Only receive notifications from this repository when participating or @mentioned.").first.click(timeout=3000)
            log("✅ Unwatched repo.")
            return {"success": True, "message": f"Unwatched repo: {url}"}
        finally:
            await browser.close()
