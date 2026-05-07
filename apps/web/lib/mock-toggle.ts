const explicitMockFlag = process.env.NEXT_PUBLIC_USE_MOCK;
const dataMode = process.env.NEXT_PUBLIC_KICETIC_DATA_MODE;

export function isMockEnabled() {
  if (explicitMockFlag != null) {
    return explicitMockFlag !== "false";
  }

  return dataMode === "mock";
}

export function getDataModeLabel() {
  return isMockEnabled() ? "mock" : "real";
}
