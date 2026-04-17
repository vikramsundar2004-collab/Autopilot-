import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders and filters the implemented improvement studio", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "150 generated improvements are tracked in the prototype",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("150/150 implemented")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Cross-device/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Round 2" }));

    expect(screen.getAllByText("Personalized templates cross-device").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Saturated").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByText("Personalized templates recommendation")).not.toBeInTheDocument();
    });
  });
});
