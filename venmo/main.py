import kernel
from kernel import Kernel
from playwright.async_api import async_playwright, Page, Browser
from typing import TypedDict
from urllib.parse import urlparse
import time
import sys

client = Kernel()

app = kernel.App("venmo")

venmo_login_url = "https://id.venmo.com/signin"
venmo_profile_selector = "[class^='profileSection_container'] .MuiAvatar-img"
persistent_browser_id = "venmo"

def log(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

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

def cleanup_str(s: str | None) -> str:
    if not s or not isinstance(s, str) or not s.strip():
        raise ValueError("String is required and must be a string")
    return s.strip()

async def is_logged_in(page: Page) -> bool:
    """
    Checks if the Venmo user avatar is present in the DOM.
    Modify the selector or attributes if needed.
    """
    try:
        await page.locator(venmo_profile_selector).first.wait_for(timeout=1000)
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
    

@app.action("provision-browser")
async def provision_browser(ctx: kernel.KernelContext) -> Output:
    kernel_browser = client.browsers.create(
        invocation_id=ctx.invocation_id,
        persistence={"id": persistent_browser_id}
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
            await page.goto(venmo_login_url, timeout=10000)
            log("Navigated to login page")
            if await is_logged_in(page):
                logged_in = True
        finally:
            await browser.close()
    if logged_in:
        return {"success": True, "message": f"Provisioned browser. It's already logged in"}
    else:
        return {"success": True, "message": f"Provisioned browser. Please go log in here: {kernel_browser.browser_live_view_url}"}

class PayUserInput(TypedDict):
    # url to get to a github repo to unwatch
    username: str
    amount: str
    note: str

@app.action("pay-user")
async def pay_user(ctx: kernel.KernelContext, input: PayUserInput) -> Output:
    username = cleanup_str(input.get("username", ""))
    amount = cleanup_str(input.get("amount", ""))
    note = cleanup_str(input.get("note", ""))
    if not note:
        return {"success": False, "message": "note is required"}
    if not amount:
        return {"success": False, "message": "amount is required"}
    if not username:
        return {"success": False, "message": "username is required"}
    kernel_browser = client.browsers.create(
        invocation_id=ctx.invocation_id,
        persistence={"id": persistent_browser_id}
    )
    log(f"live view url: {kernel_browser.browser_live_view_url}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernel_browser.cdp_ws_url)
        page = await get_page(browser)
                
        try:
            await page.goto(f"https://account.venmo.com/u/{username}")
            await page.wait_for_load_state("networkidle")
            if page.url != f"https://account.venmo.com/u/{username}":
                return {"success": False, "message": f"User {username} not found or not logged in. Redirected to {page.url}"}
            log("✅ User found.")
            await page.locator("[class*='profile_payRequestButton']").first.click(timeout=3000)
            log("✅ Navigated to pay page.")
            await page.locator("input[aria-label='Amount']").fill(amount)
            log("✅ Filled amount.")
            await page.locator("textarea[id='payment-note']").fill(note)
            log("✅ Filled note.")
            await page.locator("[class^='pay_payRequestButton'] :first-child").first.click(timeout=3000)
            log("✅ Clicked pay button.")
            await page.locator("[class*='fundingInstrumentFactory_buttonGroup'] :first-child").first.click(timeout=3000)
            log("✅ Clicked funding instrument button.")
            return {"success": True, "message": f"Paid {username} {amount} for {note}"}
        finally:
            await browser.close()

