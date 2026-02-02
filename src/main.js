import os from "os";
import path from "path";
import { chromium } from "playwright";
import { pathToFileURL } from "url";
import fs from "fs";

(async () => {
  const { RBSEE_URL, RBSEE_PROXY, RBSEE_HEADLESS, RBSEE_SECRET_PROVIDER } = process.env;

  const providerPath = resolveProviderPath(RBSEE_SECRET_PROVIDER);
  const secretProvider = await loadSecretProvider(providerPath);

  if (!RBSEE_URL) {
    throw new Error("RBSEE_URL environment variable is required");
  }

  const url = RBSEE_URL;
  const proxy = RBSEE_PROXY;
  const headless = RBSEE_HEADLESS !== "0";

  const launchOptions = {
    headless,
  };

  if (!headless) {
    launchOptions.slowMo = 200;
  }

  if (proxy) {
    launchOptions.proxy = { server: proxy };
  }

  const browser = await chromium.launch(launchOptions);

  const homeDownloads = path.join(os.homedir(), "Downloads");
  const downloadsPath = process.env.RBSEE_DOWNLOAD_DIR || homeDownloads;

  const context = await browser.newContext({
    acceptDownloads: true,
    downloadsPath,
  });

  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  await login(page, { secretProvider });

  console.log('Waiting for "Account Services" link');
  await page.waitForSelector("#accountServicesLocal", { state: "visible" });

  console.log('Clicking "Account Services"');
  await page.click("#accountServicesLocal");

  await page.waitForLoadState("networkidle");

  console.log("After clicking Account Services, URL:", page.url());

  console.log('Waiting for "Download Transactions" link');

  const downloadLink = page.locator('a[data-dig-id="OLB_PMSM_404"]');
  await downloadLink.waitFor({ state: "visible" });
  await downloadLink.click();

  try {
    await page.waitForSelector('input#Excel[type="radio"]', { timeout: 5000 });
  } catch {
    console.log('No input#Excel[type="radio"], clicking again');
    await downloadLink.click();
    await page.waitForSelector('input#Excel[type="radio"]', { timeout: 5000 });
  }

  const excel = page.locator('input#Excel[type="radio"]');
  const account = page.locator("#accountInfo");
  const continueBtn = page.locator("#id_btn_continue");

  await continueBtn.waitFor({ state: "visible", timeout: 15000 });
  await continueBtn.scrollIntoViewIfNeeded();

  console.log("Sanity test: clicking Continue BEFORE selecting anything");
  await continueBtn.click().catch((e) => console.log("pre-click error:", e.message));

  // optional: small settle so any UI side effects finish
  await page.waitForTimeout(500);

  await excel.check();
  await account.selectOption({ value: "C001" });
  await account.dispatchEvent("change");

  await page.waitForFunction(
    () => {
      const btn = document.querySelector("#id_btn_continue");
      return btn && !btn.disabled;
    },
    { timeout: 10000 },
  );

  await page.waitForFunction(() => document.title !== "", { timeout: 5000 });

  await logFormState(page, "before first click");

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 })

  await continueBtn.click();

  const download = await downloadPromise;

  const suggestedName = download.suggestedFilename();
  const finalPath = path.join(downloadsPath, suggestedName);
  await download.saveAs(finalPath);

  console.log("Downloaded:", suggestedName);

  await page.waitForLoadState("networkidle");
  console.log("After clicking continue, URL:", page.url());

  //await page.pause();

  await browser.close();
})();

async function login(page, { secretProvider }) {
  await maybeDismissCookieBanner(page);
  await page.waitForSelector("#userName", { state: "visible" });
  const username = await secretProvider.getUsername();
  if (!username) throw new Error("Secret provider returned empty username");

  await page.type("#userName", username, { delay: 20 });
  await page.waitForSelector("#signinNext", { state: "visible" });
  await page.click("#signinNext");
  await page.waitForSelector("#password", { state: "visible" });
  const password = await secretProvider.getPassword();
  if (!password) throw new Error("Secret provider returned empty password");

  await page.type("#password", password, { delay: 21 });
  await page.waitForSelector("#signinNext", { state: "visible" });
  await page.click("#signinNext");
  await page.getByRole("button", { name: "Select Another Option" }).click();
  await page.getByText("Personal Verification Question", { exact: true }).click();

  const questionSelector = 'label[for="pvqQInput"]';
  await page.waitForSelector(questionSelector, { state: "visible" });

  const question = await page.textContent(questionSelector);
  const answer = await secretProvider.get2faAnswer(question);

  if (!answer) {
    throw new Error(`Unkown 2FA question: ${question}`);
  }
  await page.type("#pvqQInput", answer, { delay: 82 });
  await page.click('button[data-testid="pvq_continue_button"]');
}

async function maybeDismissCookieBanner(page) {
  try {
    const acceptBtn = await page.waitForSelector("#onetrust-accept-btn-handler", {
      state: "visible",
      timeout: 3000,
    });

    console.log('Cookie banner detected, clicking "Accept All Cookies"');
    await acceptBtn.click();
    await page.waitForTimeout(500);
  } catch (e) {
    console.log("No cookie banner to dismiss (or not visible yet)");
  }
}

async function logFormState(page, label) {
  const s = await page.evaluate(() => {
    const form = document.PFM_FORM || document.forms?.PFM_FORM;
    const excel = document.querySelector('input#Excel[type="radio"]');
    const acct = document.querySelector("#accountInfo");
    const cont = document.querySelector("#id_btn_continue");
    return {
      title: document.title,
      formName: form?.name,
      formAction: form?.action,
      formMethod: form?.method,
      formTarget: form?.target,
      hasForm: !!form,
      excelChecked: !!excel?.checked,
      acctValue: acct?.value,
      continueHref: cont?.getAttribute("href"),
    };
  });
  console.log(`[${label}]`, s);
}

async function loadSecretProvider(providerPath) {
  const specifier = providerPath.startsWith("file:")
    ? providerPath
    : pathToFileURL(providerPath).href;

  let mod;
  try {
    mod = await import(specifier);
  } catch (e) {
    throw new Error(`Failed to import secret provider from ${p}: ${e.message}`);
  }

  const required = ["getUsername", "getPassword", "get2faAnswer"];
  for (const fn of required) {
    if (typeof mod[fn] !== "function") {
      throw new Error(`Secret provider missing required function: ${fn}()`);
    }
  }
  return mod;
}

function resolveProviderPath(input) {
  const raw = input ?? path.join(os.homedir(), ".config", "rbsee", "secret-provider.mjs");

  let fsPath;
  let specifier;

  if (raw.startsWith("file://")) {
    try {
      fsPath = new URL(raw).pathname;
      specifier = raw;
    } catch {
      throw new Error("Invalid file:// URL for RBSEE_SECRET_PROVIDER");
    }
  } else {
    if (raw.startsWith("~")) {
      throw new Error("RBSEE_SECRET_PROVIDER must be an absolute path; '~' is not allowed");
    }

    if (!path.isAbsolute(raw)) {
      throw new Error("RBSEE_SECRET_PROVIDER must be an absolute path or file:// URL");
    }

    fsPath = raw;
    specifier = pathToFileURL(raw).href;
  }

  if (!fsPath.endsWith(".mjs")) {
    throw new Error(
      "Secret provider must be an ES module with a .mjs extension"
    );
  }

  let stat;
  try {
    stat = fs.statSync(fsPath);
  } catch {
    throw new Error(`Secret provider does not exist: ${fsPath}`);
  }

  if (!stat.isFile()) {
    throw new Error(`Secret provider is not a regular file: ${fsPath}`);
  }

  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`Secret provider must be owned by the current user: ${fsPath}`);
  }

  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`Secret provider must not be group or world writable: ${fsPath}`);
  }

  const actualMode = stat.mode & 0o777;
  const allowed = [0o600];

  if (!allowed.includes(actualMode)) {
    throw new Error(
      `Secret provider permissions must be 0600; found ${actualMode.toString(8)}: ${fsPath}`,
    );
  }

  return specifier;
}
