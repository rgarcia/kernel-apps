import { Kernel } from "@onkernel/sdk";
import { generateObject } from 'ai';
import { load as loadHtml } from 'cheerio';
import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { BrowserContext, chromium, Locator, Page } from 'playwright';
import { z } from 'zod';

const kernel = new Kernel();

type ExtractedField = {
  tag: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  selectorCandidates: string[];
};

type ExtractedForm = {
  formIndex: number;
  action?: string;
  method?: string;
  id?: string;
  name?: string;
  fields: ExtractedField[];
  submitSelectorCandidates: string[];
};

const DecisionSchema = z.object({
  loginSucceeded: z.boolean(),
  interpretation: z.string().describe('A concise explanation of what you see.'),
  requiredInputs: z
    .array(
      z.object({
        formIndex: z.number().describe('Which form to use.'),
        fieldSelector: z
          .string()
          .describe('One selector chosen exactly from selectorCandidates.'),
        prompt: z
          .string()
          .describe('Short prompt for the human to provide this field value.'),
        isSecret: z
          .boolean()
          .default(false)
          .describe('True for passwords or other secrets.'),
      })
    )
    .optional(),
  submitSelector: z
    .string()
    .optional()
    .describe('Submit button selector chosen from submitSelectorCandidates for the chosen form.'),
});

function buildSelectorCandidates(tag: string, attrs: Record<string, string | undefined>): string[] {
  const selectors: string[] = [];
  const id = attrs.id;
  const name = attrs.name;
  const type = attrs.type;
  const placeholder = attrs.placeholder;

  if (id) selectors.push(`#${cssEscape(id)}`);
  if (name) selectors.push(`${tag}[name="${cssAttributeEscape(name)}"]`);
  if (type && name) selectors.push(`${tag}[type="${cssAttributeEscape(type)}"][name="${cssAttributeEscape(name)}"]`);
  if (placeholder) selectors.push(`${tag}[placeholder="${cssAttributeEscape(placeholder)}"]`);
  if (type) selectors.push(`${tag}[type="${cssAttributeEscape(type)}"]`);
  // Generic fallback
  selectors.push(tag);
  return Array.from(new Set(selectors));
}

function cssEscape(value: string): string {
  // Minimal escape for CSS ids
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function cssAttributeEscape(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}

function extractForms(html: string): ExtractedForm[] {
  const $ = loadHtml(html);
  const forms: ExtractedForm[] = [];

  $('form').each((i, form) => {
    const formElem = $(form);
    const fields: ExtractedField[] = [];

    const findLabelFor = (id?: string): string | undefined => {
      if (!id) return undefined;
      const label = $(`label[for="${cssAttributeEscape(id)}"]`).first();
      const text = label.text().trim();
      return text || undefined;
    };

    const pushField = (tag: 'input' | 'select' | 'textarea', elem: any) => {
      const attrs = {
        type: elem.attr('type'),
        name: elem.attr('name'),
        id: elem.attr('id'),
        placeholder: elem.attr('placeholder'),
      } as Record<string, string | undefined>;
      const closestLabelText = elem.closest('label').text().trim();
      const label = findLabelFor(attrs.id) ?? (closestLabelText || undefined);
      fields.push({
        tag,
        type: attrs.type,
        name: attrs.name,
        id: attrs.id,
        placeholder: attrs.placeholder,
        label,
        required: elem.is('[required]') || undefined,
        selectorCandidates: buildSelectorCandidates(tag, attrs),
      });
    };

    formElem.find('input').each((_, el) => pushField('input', $(el)));
    formElem.find('select').each((_, el) => pushField('select', $(el)));
    formElem.find('textarea').each((_, el) => pushField('textarea', $(el)));

    const submitSelectorCandidates: string[] = [];
    const submitElems = [
      ...formElem.find('button[type="submit"]').toArray(),
      ...formElem.find('input[type="submit"]').toArray(),
      ...formElem.find('button').toArray(),
    ];
    for (const el of submitElems) {
      const $el = $(el);
      const id = $el.attr('id');
      const name = $el.attr('name');
      const type = $el.attr('type');
      const text = $el.text().trim();
      if (id) submitSelectorCandidates.push(`#${cssEscape(id)}`);
      if (name) submitSelectorCandidates.push(`button[name="${cssAttributeEscape(name)}"]`);
      if (type) submitSelectorCandidates.push(`button[type="${cssAttributeEscape(type)}"]`);
      if (text) submitSelectorCandidates.push(`button:has-text("${text}")`);
      submitSelectorCandidates.push('button[type="submit"]');
      submitSelectorCandidates.push('input[type="submit"]');
    }

    forms.push({
      formIndex: i,
      action: formElem.attr('action') || undefined,
      method: formElem.attr('method') || undefined,
      id: formElem.attr('id') || undefined,
      name: formElem.attr('name') || undefined,
      fields,
      submitSelectorCandidates: Array.from(new Set(submitSelectorCandidates)),
    });
  });

  return forms;
}

async function askModelIfLoggedInAndWhatToDo(params: {
  screenshotPng: Buffer;
  forms: ExtractedForm[];
}) {
  const { screenshotPng, forms } = params;
  const instructions = `You are assisting with a human-in-the-loop login to united.com.
We will provide a screenshot and a structured list of detected forms and fields.

Tasks:
1) Determine if the user is ALREADY LOGGED IN on united.com. If clearly logged in (e.g., account dashboard, "Sign out" visible), set loginSucceeded=true.
2) If not logged in, identify ONE most relevant login form and which fields the human must provide now (e.g., username/email and password). Choose fieldSelector EXACTLY from selectorCandidates for the corresponding field. Choose submitSelector from submitSelectorCandidates of the same form.
3) Keep interpretation short (<= 2 sentences).`;

  console.log("[askModelIfLoggedInAndWhatToDo] asking model for decision");
  const { object } = await generateObject({
    model: 'openai/gpt-5',
    schema: DecisionSchema,
    messages: [
      {
        role: 'system',
        content: 'You are a precise assistant creating strict JSON decisions for website login automation.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: instructions },
          { type: 'text', text: `Here are the detected forms and fields as JSON:\n${JSON.stringify(forms, null, 2)}` },
          { type: 'image', image: screenshotPng, mediaType: 'image/png' },
        ],
      },
    ],
  });
  console.debug("[askModelIfLoggedInAndWhatToDo] model response:", object);
  return object as z.infer<typeof DecisionSchema>;
}

function heuristicFindLoginForm(forms: ExtractedForm[]) {
  // Prefer a form that contains a password input and any user identifier field
  const looksLikeUserField = (f: ExtractedField) => {
    const haystack = [f.name, f.id, f.placeholder, f.label, f.type]
      .filter(Boolean)
      .map((s) => s!.toLowerCase())
      .join(' ');
    return /user|email|e-mail|account|login|mpn|username|id/.test(haystack);
  };

  for (const form of forms) {
    const hasPassword = form.fields.some((f) => (f.type || '').toLowerCase() === 'password');
    const hasUser = form.fields.some(looksLikeUserField);
    if (hasPassword && hasUser) return form;
  }
  return forms[0];
}

async function clickFirstVisible(page: Page, locator: Locator, clickOptions?: Parameters<Locator['click']>[0]): Promise<boolean> {
  try {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const item = locator.nth(i);
      if (await item.isVisible({ timeout: 100 })) {
        const enabled = await item.isEnabled({ timeout: 100 }).catch(() => true);
        if (enabled) {
          await item.click({ timeout: 3000, ...clickOptions });
          return true;
        }
      }
    }
  } catch {
    // ignore and return false
  }
  return false;
}

async function tryToSubmit(page: Page, args: {
  form?: ExtractedForm;
  planSubmitSelector?: string;
  filledSelectors: string[];
}): Promise<boolean> {
  const { form, planSubmitSelector, filledSelectors } = args;
  const lastFilled = filledSelectors[filledSelectors.length - 1];
  console.debug(
    `[tryToSubmit] start: planSubmitSelector=${planSubmitSelector ?? 'none'}, formSubmitCandidates=${form?.submitSelectorCandidates.length ?? 0}, lastFilled=${lastFilled ?? 'none'}`
  );

  // Try programmatic form submission via DOM APIs nearest to last filled field FIRST
  if (lastFilled) {
    try {
      console.debug(`[tryToSubmit] attempting programmatic submission via closest form to: ${lastFilled}`);
      const submitted = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const form = el?.closest('form') as HTMLFormElement | null;
        if (form) {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return true;
          }
          form.submit();
          return true;
        }
        return false;
      }, lastFilled);
      if (submitted) {
        console.debug(`[tryToSubmit] succeeded via programmatic closest form submission for: ${lastFilled}`);
        return true;
      }
      console.debug(`[tryToSubmit] no form found for programmatic submission near: ${lastFilled}`);
    } catch (err) {
      console.debug(`[tryToSubmit] error during programmatic closest form submission for ${lastFilled}:`, err);
    }
  }

  // 1) Try model-provided submit selector
  if (planSubmitSelector) {
    try {
      console.debug(`[tryToSubmit] trying model submit selector: ${planSubmitSelector}`);
      const ok = await clickFirstVisible(page, page.locator(planSubmitSelector));
      if (ok) {
        console.debug(`[tryToSubmit] succeeded via model submit selector: ${planSubmitSelector}`);
        return true;
      }
      console.debug(`[tryToSubmit] no clickable element found for model selector: ${planSubmitSelector}`);
    } catch (err) {
      console.debug(`[tryToSubmit] error clicking model submit selector ${planSubmitSelector}:`, err);
    }
  }

  // 2) Try form's submit candidates
  if (form) {
    for (const sel of form.submitSelectorCandidates) {
      console.debug(`[tryToSubmit] trying form submit candidate: ${sel}`);
      const ok = await clickFirstVisible(page, page.locator(sel));
      if (ok) {
        console.debug(`[tryToSubmit] succeeded via form submit candidate: ${sel}`);
        return true;
      }
    }
  }

  // 3) Try common CTA buttons by role or text anywhere on the page
  const roleCandidates = [/continue/i, /sign\s?in/i, /next/i, /submit/i, /log\s?in/i];
  for (const pattern of roleCandidates) {
    console.debug(`[tryToSubmit] trying role-based button with name pattern: ${pattern}`);
    const byRole = page.getByRole('button', { name: pattern });
    const okRole = await clickFirstVisible(page, byRole);
    if (okRole) {
      console.debug(`[tryToSubmit] succeeded via role-based button: ${pattern}`);
      return true;
    }
  }
  const textCandidates = ['Continue', 'Sign in', 'Next', 'Submit', 'Log in'];
  for (const text of textCandidates) {
    console.debug(`[tryToSubmit] trying text-based locator: text=${text}`);
    const byText = page.locator(`text=${text}`);
    const okText = await clickFirstVisible(page, byText);
    if (okText) {
      console.debug(`[tryToSubmit] succeeded via text-based locator: text=${text}`);
      return true;
    }
  }

  // 4) Press Enter on the last filled field
  if (lastFilled) {
    try {
      console.debug(`[tryToSubmit] pressing Enter on last filled selector: ${lastFilled}`);
      await page.press(lastFilled, 'Enter', { timeout: 1500 });
      console.debug(`[tryToSubmit] succeeded by pressing Enter on: ${lastFilled}`);
      return true;
    } catch (err) {
      console.debug(`[tryToSubmit] error pressing Enter on ${lastFilled}:`, err);
    }
  }

  // 6) Try submitting the first visible form on the page as a last resort
  try {
    console.debug('[tryToSubmit] attempting to submit the first visible form on the page');
    const submitted = await page.evaluate(() => {
      const visibleForms = Array.from(document.querySelectorAll('form')).filter((f) => {
        const rect = (f as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) as HTMLFormElement[];
      const form = visibleForms[0];
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          return true;
        }
        form.submit();
        return true;
      }
      return false;
    });
    if (submitted) {
      console.debug('[tryToSubmit] succeeded via submitting the first visible form');
      return true;
    }
    console.debug('[tryToSubmit] first visible form submission did not trigger');
  } catch (err) {
    console.debug('[tryToSubmit] error submitting the first visible form:', err);
  }

  console.debug('[tryToSubmit] all strategies exhausted without success');
  return false;
}

async function fillFormWithPrompts(page: Page, forms: ExtractedForm[], plan: z.infer<typeof DecisionSchema>, terminal: readline.Interface) {
  if (!plan.requiredInputs || plan.requiredInputs.length === 0) {
    // Fallback heuristic if model did not provide details
    const form = heuristicFindLoginForm(forms);
    const usernameField = form.fields.find((f) => /text|email/.test((f.type || 'text').toLowerCase()));
    const passwordField = form.fields.find((f) => (f.type || '').toLowerCase() === 'password');

    const creds: Array<{ selector: string; prompt: string; isSecret: boolean }> = [];
    if (usernameField) creds.push({ selector: usernameField.selectorCandidates[0], prompt: 'Enter username/email: ', isSecret: false });
    if (passwordField) creds.push({ selector: passwordField.selectorCandidates[0], prompt: 'Enter password: ', isSecret: true });

    const filledSelectors: string[] = [];
    for (const c of creds) {
      const value = await askUser(terminal, c.prompt, c.isSecret);
      await page.fill(c.selector, value);
      filledSelectors.push(c.selector);
    }

    const submitted = await tryToSubmit(page, { form, filledSelectors });
    if (!submitted) {
      // As a final nudge, try pressing Enter on the page
      try { await page.keyboard.press('Enter'); } catch { }
    }
    return;
  }

  // Model provided a plan
  const filledSelectors: string[] = [];
  for (const field of plan.requiredInputs) {
    const value = await askUser(terminal, `${field.prompt} `, field.isSecret);
    await page.fill(field.fieldSelector, value);
    filledSelectors.push(field.fieldSelector);
  }

  if (plan.submitSelector) {
    const submitted = await tryToSubmit(page, { form: forms[plan.requiredInputs?.[0]?.formIndex ?? 0], planSubmitSelector: plan.submitSelector, filledSelectors });
    if (!submitted) {
      try { await page.keyboard.press('Enter'); } catch { }
    }
  }
}

async function askUser(terminal: readline.Interface, prompt: string, isSecret: boolean): Promise<string> {
  if (!isSecret) return terminal.question(prompt);
  // Minimal masking: turn off echo by setting raw mode and not writing characters
  // Node's readline does not support masking well; we will print a warning and accept normal input
  return terminal.question(`${prompt}(input hidden not supported in this CLI; will echo) `);
}

async function saveUnitedCookies(context: BrowserContext, outFile: string) {
  const cookies = await context.cookies();
  const unitedCookies = cookies.filter((c) => c.domain.includes('united.com'));
  await fs.writeFile(outFile, JSON.stringify(unitedCookies, null, 2), 'utf-8');
}

async function main() {
  const terminal = readline.createInterface({ input, output });

  let context: BrowserContext | null;
  let page: Page | null;
  if (false) {
    // const browser = await chromium.launch({ headless: false });
    // context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // page = await context.newPage();
  } else {
    const kernelBrowser = await kernel.browsers.create();
    console.log("live view:", kernelBrowser.browser_live_view_url);
    const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
    context = await browser.contexts()[0];
    page = await context.pages()[0];
  }

  await page.goto('https://www.united.com/en/us/united-mileageplus-signin/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.waitForTimeout(1500);
    const screenshot = await page.screenshot({ fullPage: true });
    const html = await page.content();
    const forms = extractForms(html);

    const decision = await askModelIfLoggedInAndWhatToDo({ screenshotPng: screenshot, forms });
    console.log(`Model interpretation: ${decision.interpretation}`);

    if (decision.loginSucceeded) {
      const cookiesPath = path.resolve(process.cwd(), 'united-cookies.json');
      await saveUnitedCookies(context, cookiesPath);
      console.log(`Login detected. Saved cookies to ${cookiesPath}`);
      break;
    }

    console.log('Login not yet succeeded. Prompting for inputs...');
    await fillFormWithPrompts(page, forms, decision, terminal);

    // Wait for possible navigation / result
    try {
      await Promise.race([
        page.waitForNavigation({ timeout: 15000 }),
        page.waitForLoadState('networkidle', { timeout: 15000 }),
        page.waitForTimeout(5000),
      ]);
    } catch { }
  }

  // Final save if we reached here and are logged in
  const finalHtml = await page.content();
  const finalScreenshot = await page.screenshot({ fullPage: true });
  await fs.writeFile('united-final.png', finalScreenshot);
  const finalForms = extractForms(finalHtml);
  const finalDecision = await askModelIfLoggedInAndWhatToDo({ screenshotPng: finalScreenshot, forms: finalForms });
  if (finalDecision.loginSucceeded) {
    const cookiesPath = path.resolve(process.cwd(), 'united-cookies.json');
    await saveUnitedCookies(context, cookiesPath);
    console.log(`Login detected (final). Saved cookies to ${cookiesPath}`);
  } else {
    console.log('Login still not detected. You may need to try again or adjust inputs.');
  }

  await terminal.close();
  // Keep browser open for inspection; comment out the next lines to auto-close
  // await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
