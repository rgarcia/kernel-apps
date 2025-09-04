import { ConflictError, Kernel } from "@onkernel/sdk";
import prompts from "prompts";

const kernel = new Kernel();

// 1. Create a profile
//    If you want you can give it a name that is unique within your organization and conveys some information about the profile
try {
  await kernel.profiles.create({ name: "profiles-test-ts" });
} catch (error) {
  if (error instanceof ConflictError) {
    console.log("Profile already exists, continuing...");
  } else {
    throw error;
  }
}

// 2. Create a browser session using the profile, opting to save changes made (cookies, etc.) during the session to the profile when the browser is closed.
const kernelBrowser = await kernel.browsers.create({
  profile: {
    name: "profiles-test-ts",
    save_changes: true,
  },
});


// 3. Use the browser either with the live view url or with automation code.
console.log(
  "Kernel browser live view url: ",
  kernelBrowser.browser_live_view_url
);

await prompts({
  type: 'confirm',
  name: 'wait',
  message: "Use the live view url to navigate and create some login state. Press enter when you're done",
  initial: true,
});


await kernel.browsers.deleteByID(kernelBrowser.session_id)

console.log("creating a new browser from the profile")

// 4. Create a browser session using the saved profile data but without modifying the profile.
const kernelBrowser2 = await kernel.browsers.create({
  profile: {
    name: "profiles-test-ts",
  },
});

console.log("Kernel browser live view url: ",
  kernelBrowser2.browser_live_view_url
);

await prompts({
  type: 'confirm',
  name: 'wait',
  message: "Use the live view url to navigate and check the login state was persisted. Press enter when you're done",
  initial: true,
});

await kernel.browsers.deleteByID(kernelBrowser2.session_id)
