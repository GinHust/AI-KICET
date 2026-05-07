import { chromium } from "@playwright/test";

const PROJECT_ID = "kmauqhbgxpnfbsdrsabq";

function sanitizeConnectionString(value: string) {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:<PASSWORD>@");
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("Supabase 대시보드 접속 중...");
  await page.goto(`https://supabase.com/dashboard/project/${PROJECT_ID}/settings/database`);
  await page.waitForTimeout(3000);

  if (page.url().includes("sign-in") || page.url().includes("login")) {
    console.log("로그인이 필요합니다. 브라우저에서 인증을 완료해주세요.");
    await page.waitForURL(`**/project/${PROJECT_ID}**`, { timeout: 120000 });
    await page.goto(`https://supabase.com/dashboard/project/${PROJECT_ID}/settings/database`);
    await page.waitForTimeout(3000);
  }

  const pageText = await page.textContent("body");
  const uriMatch = pageText?.match(/postgresql:\/\/[^\s"']+/);
  if (uriMatch) {
    console.log("URI 발견:", sanitizeConnectionString(uriMatch[0]));
  } else {
    console.log("URI를 텍스트에서 못 찾았습니다.");
    console.log("현재 URL:", page.url());
  }

  const uriTab = page.locator('text=URI').first();
  if (await uriTab.isVisible()) {
    await uriTab.click();
    await page.waitForTimeout(1000);
    const input = page.locator('input[value*="postgresql"]').first();
    if (await input.isVisible()) {
      const val = await input.inputValue();
      console.log("\n=== CONNECTION STRING (SANITIZED) ===");
      console.log(sanitizeConnectionString(val));
      console.log("실제 접속 문자열은 콘솔에 출력하지 않습니다.");
      console.log("=====================================\n");
    }
  }
  await browser.close();
}

main().catch(console.error);
