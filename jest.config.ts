import type { Config } from "jest";

/**
 * Testy jednostkowe celują w warstwę domenową (src/server/**), która z założenia
 * nie zna Reacta ani Next.js — dlatego wystarczy zwykłe środowisko node,
 * bez next/jest i bez jsdom. To jest efekt uboczny rozdziału warstw, nie przypadek.
 */
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests/unit"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/*.test.ts"],
};

export default config;
