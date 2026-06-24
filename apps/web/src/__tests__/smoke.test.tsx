import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

function SmokeComponent() {
  return <div>Aegis AI Frontend Dashboard</div>;
}

describe("Frontend Smoke Test", () => {
  it("renders the smoke component successfully", () => {
    render(<SmokeComponent />);
    expect(screen.getByText("Aegis AI Frontend Dashboard")).toBeDefined();
  });
});
