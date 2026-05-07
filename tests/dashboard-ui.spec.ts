import { expect, test } from "@playwright/test";

type ValidationStreamRequestPayload = {
  goal: string;
  num_agents: number;
  num_candidates: number;
  max_validation_passes: number;
  use_web_search: boolean;
  debug_mode: boolean;
};

function formatSseEvent(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function advanceResearchPreview(page: import("@playwright/test").Page) {
  const startButton = page.getByRole("button", { name: "이 질문으로 토론 시작" });
  const reClarifyButton = page.getByRole("button", { name: "질문 재정리" });
  const skipButton = page.getByRole("button", { name: "건너뛰기" });

  if (await reClarifyButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }

  await expect(startButton).toBeVisible({ timeout: 20000 });
  await startButton.click();
}

test("research panel runs independent live discussion flow", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/dashboard/research");

  await expect(page.getByRole("heading", { name: "Multi-Agent AI 연구 콘솔" })).toBeVisible();
  await expect(page.getByText("토론 콘솔", { exact: true })).toBeVisible();
  await expect(page.getByText("연구 API").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /토론/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /검증 랩/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /그래프/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /에이전트/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /보고서/ })).toBeVisible();

  await expect(page.getByText("안전 조건 자동 적용")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("승인된 공정 안전 범위를 다음 토론과 검증에 자동으로 적용합니다.")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("초기 constraint 후보 전체 검토")).toBeHidden();
  await expect(page.getByText("mpcvd-pressure-window")).toBeHidden();

  const expertSelect = page.locator("label").filter({ hasText: "전문가 수" }).locator("select");
  await expertSelect.selectOption("12");
  await expect(expertSelect).toHaveValue("12");

  const discussionTextarea = page.locator("textarea");
  await expect(discussionTextarea).toBeVisible();
  await expect(discussionTextarea).toHaveValue("");
  await discussionTextarea.fill("Should we prioritize methane ratio control before broadening substrate experiments?");
  await page.getByRole("button", { name: "토론 시작" }).click();
  await expect(page.getByText("토론 질문 미리보기")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("적용 예정 안전 조건")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("적용 예정 제약")).toBeHidden();
  await expect(page.getByText("최대 전문가 12명, 3개 라운드 기준으로 세션을 준비했습니다.")).toBeVisible({ timeout: 20000 });
  await advanceResearchPreview(page);
  await expect(page.getByText("핵심 요약", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("적용된 안전 조건", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("토론과 가설 검증에 반영된 공정 안전 범위입니다.")).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("Context budget", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("Structured brief", { exact: true }).first()).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("Experiment proposal", { exact: true }).first()).toBeVisible({ timeout: 120000 });
  await page.evaluate(() => {
    window.localStorage.setItem("kicetic-advanced-controls", "true");
    window.dispatchEvent(new CustomEvent("kicetic-advanced-controls-changed", { detail: { enabled: true } }));
  });
  const developerModeButton = page.getByRole("button", { name: /개발자 모드 OFF/ });
  await expect(developerModeButton).toBeVisible({ timeout: 20000 });
  await developerModeButton.click();
  await expect(page.getByText("Developer chunks", { exact: true }).first()).toBeVisible({ timeout: 20000 });

  await page.getByRole("link", { name: /검증 랩 가설 검토/ }).click();
  await expect(page.getByText("목표 입력", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "검증 실행" })).toBeVisible();
  await expect(page.getByText("검증 전문가 수", { exact: true })).toBeVisible();
  await expect(page.getByText("자동 추가 검증", { exact: true })).toBeVisible();

  const validationPayloads: ValidationStreamRequestPayload[] = [];
  await page.route("**/api/projects/*/hypothesis-exploration/stream", async (route) => {
    const payload = route.request().postDataJSON() as ValidationStreamRequestPayload;
    const requestNumber = validationPayloads.length + 1;
    validationPayloads.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: formatSseEvent("done", {
        run_id: `validation-e2e-${requestNumber}`,
        question: payload.goal,
        summary: "검증 근거가 부족해 2차 검증까지 실행했습니다.",
        next_actions: ["Run narrowed methane trial."],
        open_questions: ["Which pressure window is safest?"],
        agents: [
          {
            agent_id: "validator-1",
            role: "공정 검증 전문가",
            stance: "specialist",
            focus: "methane stability validation",
            evidence_focus: ["growth stability"],
            knowledge_scope: ["MPCVD"],
            retrieval_terms: ["methane", "pressure"]
          }
        ],
        hypotheses: [
          {
            hypothesis_id: "hyp-1",
            title: "Methane guardrail",
            family: "mechanistic",
            statement: "Narrow methane flow changes before broad substrate screening.",
            rationale: "Methane perturbation can dominate growth-rate stability.",
            proposed_experiment: "Compare growth rate under a narrow methane perturbation window.",
            source_evidence_ids: ["ev-1"]
          }
        ],
        validations: [
          {
            hypothesis_id: "hyp-1",
            agent_id: "validator-1",
            agent_name: "공정 검증 전문가",
            verdict: "mixed",
            reasoning: "Second-pass evidence checks methane ramp stability and chamber pressure hysteresis across a narrow operating window.",
            confidence: "medium",
            evidence_ids: ["ev-1"],
            key_test: "Compare growth rate under ±0.2 sccm CH4 perturbation.",
            validation_pass: 2
          }
        ],
        hypothesis_rankings: [
          {
            hypothesis_id: "hyp-1",
            rank: 1,
            plausibility_score: 0.82,
            feasibility_score: 0.76,
            evidence_score: 0.66,
            novelty_score: 0.58,
            recommendation: "Run the methane guardrail first.",
            summary: "This is the most practical validation path.",
            risk_note: "Evidence is still thin after the second pass."
          }
        ],
        selected_hypothesis_id: "hyp-1",
        validation_passes: 2,
        validation_complete: false,
        validation_gap_reasons: ["Methane guardrail: 독립 근거가 2개 미만입니다."],
        evidence: [
          {
            evidence_id: "ev-1",
            title: "Methane control note",
            source: "test-fixture",
            year: 2026,
            summary: "Methane flow perturbations affect growth stability.",
            excerpt: "A narrow perturbation test can reveal stability limits.",
            entity_keys: ["methane"]
          }
        ],
        created_at: "2026-05-06T00:00:00.000Z"
      })
    });
  });

  const validationExpertSelect = page.locator("label").filter({ hasText: "검증 전문가 수" }).locator("select");
  await validationExpertSelect.selectOption("4");
  await expect(validationExpertSelect).toHaveValue("4");

  const validationGoal = "Generate multiple methane control plans with expert validation.";
  const validationTextarea = page.locator("textarea");
  await validationTextarea.fill(validationGoal);
  await page.getByRole("button", { name: "검증 실행" }).click();

  const validationRunButtons = page.locator("button").filter({ hasText: validationGoal });
  await expect(validationRunButtons).toHaveCount(1, { timeout: 120000 });
  expect(validationPayloads[0]).toMatchObject({ goal: validationGoal, num_agents: 4, num_candidates: 2 });
  expect(validationPayloads[0].max_validation_passes).toBe(validationPayloads[0].debug_mode ? 1 : 2);
  await expect(page.getByText("검증 요약", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("선택된 가설", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("판별 실험", { exact: true }).first()).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("검증 pass", { exact: true }).first()).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("2회 · 추가 검토 필요").first()).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "가설 비교" })).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "검증 의견" })).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "검증 실행" })).toBeEnabled({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "같은 목표 재실행" })).toBeEnabled({ timeout: 120000 });

  await page.getByRole("button", { name: "검증 의견" }).click();
  await expect(page.getByText("선택 가설 검증 의견", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText("2차 검증", { exact: true })).toBeVisible({ timeout: 120000 });
  const expandOpinionButton = page.getByRole("button", { name: "의견 펼치기" }).first();
  await expect(expandOpinionButton).toBeVisible({ timeout: 120000 });
  await expandOpinionButton.click();
  await expect(page.getByRole("button", { name: "의견 접기" }).first()).toBeVisible();
  await page.getByRole("button", { name: "가설 비교" }).click();

  await page.getByRole("button", { name: "같은 목표 재실행" }).click();
  await expect(validationRunButtons).toHaveCount(2, { timeout: 120000 });
  expect(validationPayloads).toHaveLength(2);
  expect(validationPayloads[1]).toMatchObject({ goal: validationGoal, num_agents: 4 });

  await page.getByRole("link", { name: /그래프/ }).click();
  await expect(page.getByRole("heading", { name: "지식 그래프" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "필터와 검색" })).toBeVisible();
  await expect(page.getByText(/\d+ entities, \d+ relationships/)).toBeVisible();
  await expect(page.getByText("선택 상세", { exact: true })).toBeVisible();
  await expect(page.getByText("선택한 노드 또는 관계의 세부 정보를 확인합니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "⛶ 전체 화면" })).toBeVisible();

  await page.getByRole("link", { name: /에이전트/ }).click();
  await expect(page.getByRole("heading", { name: "AI 전문가 에이전트" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "전문가 에이전트 패널" })).toBeVisible();
  await expect(page.getByText("지식 그래프와 토론 세션을 바탕으로 구성된 전체 전문가 목록을 접고 펼치는 행 구조로 확인합니다.")).toBeVisible();

  await page.getByRole("link", { name: /보고서/ }).click();
  await expect(page.getByRole("heading", { name: "세션 기반 보고서" })).toBeVisible();
  await expect(page.getByText("보고서 상세", { exact: true })).toBeVisible();
  await expect(page.getByText("Context budget / 압축 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("Constraint risks / Experiment proposals", { exact: true })).toBeVisible();
});

test("hidden advanced trigger exposes constraint controls", async ({ page }) => {
  await page.goto("/dashboard/research");

  await expect(page.getByText("안전 조건 자동 적용")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("초기 constraint 후보 전체 검토")).toBeHidden();

  const researchLink = page.getByRole("link", { name: /1\. Multi Agent/ });
  for (let index = 0; index < 10; index += 1) {
    await researchLink.click();
  }

  await expect(page.getByText("초기 constraint 후보 전체 검토")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("전체 승인", { exact: true })).toBeVisible();
  await expect(page.getByText("mpcvd-pressure-window")).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => window.localStorage.getItem("kicetic-advanced-controls"))).toBe("true");
});

test("bo panel refreshes recommendation cards", async ({ page }) => {
  await page.goto("/dashboard/bo");

  await expect(page.getByRole("heading", { name: "Physics-Informed Bayesian Optimization" })).toBeVisible();
  await expect(page.getByText("BO 연결 상태", { exact: true })).toBeVisible();
  await expect(page.getByText("API target", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByText("다음 실험 추천 조건")).toBeVisible();
  await expect(page.getByText(/Research safe boundary/)).toBeVisible();

  await page.getByRole("button", { name: "추천 받기" }).click();

  await expect(page.getByText("Substrate")).toBeVisible();
  await expect(page.getByText("Power")).toBeVisible();
  await expect(page.getByText("Pressure")).toBeVisible();
  await expect(page.getByText("Safety notes", { exact: true })).toBeVisible();
});

test("mock-stage panels show construction roadmap", async ({ page }) => {
  await page.route("**/api/surrogate/cantera/run", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, number>;
    expect(payload.h2FlowSccm).toBe(100);
    expect(payload.ch4FlowSccm).toBe(5.4);
    expect(payload.nitrogenFlowSccm).toBe(0.00432);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready",
        message: "Cantera diamond.yaml 실행이 완료되었습니다.",
        growthRateUmPerHour: 0.216,
        mechanism: "apps/api/app/data/mechanisms/diamond.yaml",
        mechanismSource: "repo",
        canteraVersion: "3.2.0",
        gasPhase: "gas",
        surfacePhase: "diamond_100",
        nitrogenApplied: false,
        surfaceCoverages: [{ species: "c6HH", coverage: 0.49 }],
        notes: ["diamond.yaml gas phase에 N2 species가 없어 질소 입력은 Cantera solver에는 직접 반영되지 않았습니다."]
      })
    });
  });

  await page.goto("/dashboard/surrogate");
  await expect(page.getByRole("heading", { name: "대리 모델 워크벤치 준비 중" })).toBeVisible();
  await expect(page.getByText("3. Surrogate · 공사중")).toBeVisible();
  await expect(page.getByText("surface kinetics estimator", { exact: true })).toBeVisible();
  await expect(page.getByText("H mole fraction", { exact: true })).toBeVisible();
  await expect(page.getByText("H₂ flow [sccm]", { exact: true })).toBeVisible();
  await expect(page.getByText("CH₄ flow [sccm]", { exact: true })).toBeVisible();
  await expect(page.getByText("N₂ flow [sccm]", { exact: true })).toBeVisible();
  await page.locator("label").filter({ hasText: "H mole fraction" }).locator("input").fill("0.0012");
  await page.locator("label").filter({ hasText: "H₂ flow" }).locator("input").fill("100");
  await page.locator("label").filter({ hasText: "CH₄ flow" }).locator("input").fill("5.4");
  await page.locator("label").filter({ hasText: "N₂ flow" }).locator("input").fill("0.00432");
  await page.getByRole("button", { name: "성장 속도 예측" }).click();
  await expect(page.getByText("Predicted growth rate")).toBeVisible();
  await expect(page.getByText("Growth rate", { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)? μm\/h/).first()).toBeVisible();
  await expect(page.getByText("Surface coverage")).toBeVisible();
  await expect(page.getByText("Nitrogen boost", { exact: true })).toBeVisible();
  await expect(page.getByText("Quality risk", { exact: true })).toBeVisible();
  await expect(page.getByText("H mole fraction sensitivity")).toBeVisible();
  await expect(page.getByText("N₂ ratio sensitivity")).toBeVisible();
  await expect(page.getByText("불확실성", { exact: true })).toBeVisible();
  await expect(page.getByText("Cantera diamond.yaml run", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cantera diamond.yaml 실행" }).click();
  await expect(page.getByText("Cantera diamond.yaml 실행이 완료되었습니다.")).toBeVisible();
  await expect(page.getByText("Solver growth rate", { exact: true })).toBeVisible();
  await expect(page.getByText("Mechanism source", { exact: true })).toBeVisible();
  await expect(page.getByText("Top surface coverages", { exact: true })).toBeVisible();
  await expect(page.getByText("c6HH", { exact: true })).toBeVisible();

  await page.goto("/dashboard/physical-ai");
  await expect(page.getByRole("heading", { name: "디지털 트윈 제어실 준비 중" })).toBeVisible();
  await expect(page.getByText("4. Physical AI · 공사중")).toBeVisible();
  await expect(page.getByText("Control loop")).toBeVisible();

  await page.goto("/dashboard/x-ai");
  await expect(page.getByRole("heading", { name: "의사결정 레이어 준비 중" })).toBeVisible();
  await expect(page.getByText("5. X.AI · 공사중")).toBeVisible();
  await page.getByRole("button", { name: "연구원" }).click();
  await expect(page.getByText("연구원 관점")).toBeVisible();
});

test("sticky top navigation shows renamed IA", async ({ page }) => {
  await page.goto("/dashboard/overview");

  await expect(page.getByRole("heading", { name: "설계 → 공정 최적화 → 실행 → 분석" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Home$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /1\. Multi Agent/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /2\. BO/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /4\. Physical AI/ })).toBeVisible();
  await expect(page.getByText("MPCVD Diamond AI")).toBeVisible();
  await expect(page.getByRole("link", { name: /Multi Agent 시작/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /BO 추천 보기/ })).toBeVisible();
  await expect(page.locator("section[aria-label='KICETIC module entry points']")).toBeVisible();
  await expect(page.getByRole("link", { name: /Recommendation-ready/ })).toBeVisible();
  await expect(page.getByText("Closed-loop workflow")).toBeVisible();
  await expect(page.getByText("Trust signals")).toBeVisible();
  await expect(page.getByText("Build roadmap")).toBeVisible();
  await expect(page.getByText("Watchlist")).toBeVisible();
});

test("surrogate spectroscopy smoke renders advisory comparison and export artifacts", async ({ page }) => {
  test.setTimeout(90000);

  await page.goto("/dashboard/surrogate");

  await expect(page.getByRole("heading", { name: "대리 모델 워크벤치 준비 중" })).toBeVisible();
  await expect(page.getByText("surface kinetics estimator", { exact: true })).toBeVisible();
  await expect(page.getByText("XRD/Raman spectroscopy workspace", { exact: true })).toBeVisible();
  await expect(page.getByLabel("XRD/Raman mode selector")).toBeVisible();
  await expect(page.getByLabel(/expected material|formula|예상.*물질|화학식/i)).toBeVisible();
  await expect(page.locator("input[type='file']")).toBeVisible();

  await page.getByLabel("XRD/Raman mode selector").selectOption("xrd");
  await page.getByLabel(/expected material|formula|예상.*물질|화학식/i).fill("diamond carbon");
  await page.locator("input[type='file']").setInputFiles([
    {
      name: "sample_a.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("two_theta,intensity\n42,10\n43,35\n44,100\n45,30\n74,14\n75,62\n76,18\n")
    },
    {
      name: "sample_b.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("two_theta,intensity\n42,9\n43,25\n44.2,100\n45,27\n74,12\n75.4,58\n76,18\n")
    }
  ]);
  await expect(page.getByText("sample_a", { exact: true })).toBeVisible();
  await expect(page.getByText("sample_b", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /analy[sz]e|분석/i }).click();

  await expect(page.getByText("Figure/comparison area", { exact: true })).toBeAttached();
  await expect(page.getByRole("img", { name: /Publication-ready XRD comparison figure/i })).toBeVisible();
  await expect(page.getByText("overlay comparison", { exact: true })).toBeVisible();
  await expect(page.getByText(/Peak candidates/i)).toBeVisible();
  await expect(page.getByText(/Reference notes/i)).toBeVisible();
  await expect(page.getByText("Built-in XRD marker template", { exact: true })).toBeVisible();
  await expect(page.getByText(/Advisory spectroscopy analysis/i)).toBeVisible();
  await expect(
    page.getByText("Advisory/reference-only analysis; no conclusive phase, crystallinity, purity, or identity claim is made.", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Export 300ppi raster metadata" })).toBeVisible();
  await expect(page.getByLabel("Actual SVG/vector export artifact content")).toContainText("<svg");

  const exportSvg = page.getByRole("link", { name: /export.*svg|svg.*vector|SVG.*내보내기/i });
  await expect(exportSvg).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportSvg.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  expect(Buffer.concat(chunks).toString("utf8")).toContain("<svg");

  await expect(page.getByRole("link", { name: /export.*csv|processed.*csv|CSV.*내보내기/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /300ppi raster metadata|raster|PNG.*내보내기/i })).toBeVisible();
});
