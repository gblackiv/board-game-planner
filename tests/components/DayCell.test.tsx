import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DayCell } from "@/components/DayCell";

describe("DayCell", () => {
  it("renders the day number", () => {
    render(<DayCell date="2026-06-15" available={false} onToggle={() => {}} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows available styling when available is true", () => {
    render(<DayCell date="2026-06-15" available={true} onToggle={() => {}} />);
    const cell = screen.getByRole("button");
    expect(cell).toHaveClass("bg-green-500");
  });

  it("shows default styling when available is false", () => {
    render(<DayCell date="2026-06-15" available={false} onToggle={() => {}} />);
    const cell = screen.getByRole("button");
    expect(cell).not.toHaveClass("bg-green-500");
  });

  it("calls onToggle with the date when tapped", () => {
    const onToggle = vi.fn();
    render(<DayCell date="2026-06-15" available={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("2026-06-15");
  });

  it("renders as non-interactive in readOnly mode", () => {
    render(<DayCell date="2026-06-15" available={true} readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows count when provided", () => {
    render(<DayCell date="2026-06-15" available={false} readOnly count={7} totalCouples={10} />);
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });
});
