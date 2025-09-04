import asyncio

from kernel import AsyncKernel, ConflictError

kernel = AsyncKernel()


async def main():
    # 1. Create a profile
    #    If you want you can give it a name that is unique within your organization and conveys some information about the profile
    try:
        await kernel.profiles.create(name="profiles-test-py")
    except ConflictError:
        pass

    # 2. Create a browser session using the profile, opting to save changes made (cookies, etc.) during the session to the profile when the browser is closed.
    kernel_browser = await kernel.browsers.create(
        profile={
            "name": "profiles-test-py",
            "save_changes": True,
        }
    )

    # 3. Use the browser either with the live view url or with automation code.
    print("Kernel browser live view url: ", kernel_browser.browser_live_view_url)
    input(
        "Use the live view url to navigate and create some login state. Press enter when you're done"
    )

    await kernel.browsers.delete_by_id(kernel_browser.session_id)

    print("creating a new browser from the saved profile")

    # 4. Create a browser session using the saved profile data but without modifying the profile.
    kernel_browser2 = await kernel.browsers.create(profile={"name": "profiles-test-py"})

    print("Kernel browser live view url: ", kernel_browser2.browser_live_view_url)

    input(
        "Use the live view url to navigate and check the login state was persisted. Press enter when you're done"
    )

    await kernel.browsers.delete_by_id(kernel_browser2.session_id)


if __name__ == "__main__":
    asyncio.run(main())
