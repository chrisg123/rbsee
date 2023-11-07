import { chromium } from "playwright";

(async () => {
  const { RBSEE_URL, RBSEE_PROXY, RBSEE_HEADLESS } = process.env;

  if (!RBSEE_URL) {
    throw new Error("RBSEE_URL environment variable is required");
  }

  const url = RBSEE_URL;
  const proxy = RBSEE_PROXY;
  const headless = RBSEE_HEADLESS !== '0';

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
  const page = await browser.newPage();

  await page.goto(url);

  console.log(await page.title());

  console.log("URL:", page.url());
  const links = await page.$$eval("a", (as) =>
    as.map((a) => ({ text: a.textContent?.trim(), href: a.href })),
  );
  console.log(
    "LINKS:",
    links.filter((l) => l.text),
  );

  await page.pause();

  await browser.close();
})();
