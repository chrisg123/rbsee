import os from "os";
import path from "path";
import { chromium } from "playwright";

(async () => {
  const { RBSEE_URL, RBSEE_PROXY, RBSEE_HEADLESS, RBSEE_USERNAME, RBSEE_PASSWORD } = process.env;
  const pvqConfig = loadPvqFromEnv();
  const pvqMap = buildPvqMap(pvqConfig);

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

  await login(page, {
    username: RBSEE_USERNAME,
    password: RBSEE_PASSWORD,
    pvqMap: pvqMap,
  });

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

  let download;

  await page.waitForFunction(() => document.title !== "", { timeout: 5000 });

  await logFormState(page, "before first click");

  [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 3000 }),
    continueBtn.click(),
  ]);

  const suggestedName = download.suggestedFilename();
  const finalPath = path.join(downloadsPath, suggestedName);
  await download.saveAs(finalPath);

  console.log("Downloaded:", suggestedName);

  await page.waitForLoadState("networkidle");
  console.log("After clicking continue, URL:", page.url());

  //await page.pause();

  await browser.close();
})();

async function login(page, { username, password, pvqMap }) {
  await maybeDismissCookieBanner(page);
  await page.waitForSelector("#userName", { state: "visible" });
  await page.type("#userName", username, { delay: 20 });
  await page.waitForSelector("#signinNext", { state: "visible" });
  await page.click("#signinNext");
  await page.waitForSelector("#password", { state: "visible" });
  await page.type("#password", password, { delay: 21 });
  await page.waitForSelector("#signinNext", { state: "visible" });
  await page.click("#signinNext");
  await page.getByRole("button", { name: "Select Another Option" }).click();
  await page.getByText("Personal Verification Question", { exact: true }).click();

  const questionSelector = 'label[for="pvqQInput"]';
  await page.waitForSelector(questionSelector, { state: "visible" });
  const questionText = await page.textContent(questionSelector);
  const question = questionText.trim();
  const questionNorm = question.toLowerCase();
  let answer = pvqMap[questionNorm];
  if (!answer) {
    throw new Error(`Unkown PVQ question: ${questionText}`);
  }
  await page.type("#pvqQInput", answer, { delay: 82 });
  await page.click('button[data-testid="pvq_continue_button"]');
}

function loadPvqFromEnv() {
  const raw = process.env.RBSEE_PVQ_JSON;
  if (!raw) {
    throw new Error("RBSEE_PVQ_JSON is not set");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`RBSEE_PVQ_JSON is not valid JSON: ${e.message}`);
  }
  return parsed;
}

function buildPvqMap(cfg) {
  console.log(`cfg: ${cfg}`);
  const map = {};
  for (const { text, answer } of cfg.questions || []) {
    if (!text || !answer) continue;
    map[text.trim().toLowerCase()] = answer;
  }
  return map;
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
