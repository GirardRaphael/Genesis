import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import {
  ActiveFilters,
  AgentViewSelector,
  WorkspaceNavigation,
  clearedFilters,
  selectionFilters,
  workspaceFor,
} from "./WorkspaceControls";
import { readSelection } from "./state";
import type { Selection } from "./state";

function buttons(
  node: ReactNode,
): ReactElement<{ onClick: () => void; "aria-label"?: string }>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return child.type === "button"
      ? [child as ReactElement<{ onClick: () => void; "aria-label"?: string }>]
      : buttons(child.props.children);
  });
}

describe("workspace controls", () => {
  it("exposes exactly three named workspaces independently of hidden labels", () => {
    const onNavigate = vi.fn();
    const nav = WorkspaceNavigation({ view: "dispatch", onNavigate });
    const actions = buttons(nav);
    expect(actions.map((action) => action.props["aria-label"])).toEqual([
      "Opérations",
      "Analytique",
      "Agents",
    ]);
    expect(actions.every((action) => !!action.props["aria-label"])).toBe(true);
    const html = renderToStaticMarkup(nav);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    actions
      .find((action) => action.props["aria-label"] === "Analytique")!
      .props.onClick();
    expect(onNavigate).toHaveBeenCalledWith("analytics");
  });
  it("keeps every historical execution page inside the Agents workspace", () => {
    for (const view of [
      "overview",
      "fleet",
      "runs",
      "compare",
      "observatory",
    ] as const) {
      expect(workspaceFor(view)).toBe("observatory");
      const html = renderToStaticMarkup(
        <WorkspaceNavigation view={view} onNavigate={vi.fn()} />,
      );
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toContain(
        'aria-label="Agents" title="Agents" aria-current="page"',
      );
      const selector = renderToStaticMarkup(
        <AgentViewSelector view={view} onNavigate={vi.fn()} />,
      );
      expect(selector).toContain(`value="${view}" selected=""`);
    }
    expect(
      AgentViewSelector({ view: "dispatch", onNavigate: vi.fn() }),
    ).toBeNull();
    expect(
      AgentViewSelector({ view: "analytics", onNavigate: vi.fn() }),
    ).toBeNull();
  });
  it("exposes hidden filter values and removes one without dropping the chosen run", () => {
    const selection = readSelection(
      "?view=overview&run=keep&left=a&right=b&agent=planning&status=failed&model=claude-demo",
    );
    const changes: Partial<Selection>[] = [];
    const component = ActiveFilters({
      selection,
      onChange: (change) => changes.push(change),
    });
    const html = renderToStaticMarkup(component);
    expect(html).toContain("claude-demo");
    expect(html).toContain("3 filtres actifs");
    buttons(component)
      .find((button) =>
        button.props["aria-label"]?.startsWith("Retirer le filtre Modèle"),
      )!
      .props.onClick();
    expect(changes).toEqual([{ model: "" }]);
    expect({ ...selection, ...changes[0] }).toMatchObject({
      run: "keep",
      left: "a",
      right: "b",
      agent: "planning",
      status: "failed",
      model: "",
    });
  });
  it("clears filters without resetting the view, selected run or comparison", () => {
    const selection = readSelection(
      "?view=runs&run=keep&left=a&right=b&agent=planning&q=old",
    );
    const onChange = vi.fn();
    const component = ActiveFilters({ selection, onChange });
    buttons(component).at(-1)!.props.onClick();
    expect(onChange).toHaveBeenCalledWith(clearedFilters);
    expect({ ...selection, ...clearedFilters }).toMatchObject({
      view: "runs",
      run: "keep",
      left: "a",
      right: "b",
      agent: "",
      query: "",
    });
  });
  it("does not imply that a local inventory search filters analytics", () => {
    const selection = readSelection("?view=analytics&q=delivery");
    expect(selectionFilters(selection)).toEqual([]);
    expect(ActiveFilters({ selection, onChange: vi.fn() })).toBeNull();
    expect(selectionFilters({ ...selection, view: "runs" })).toEqual([
      { key: "query", label: "Recherche locale", value: "delivery" },
    ]);
  });
  it("escapes external labels in removable filter controls", () => {
    const selection = {
      ...readSelection(""),
      model: '<img src=x onerror="alert(1)">',
    };
    const html = renderToStaticMarkup(
      <ActiveFilters selection={selection} onChange={vi.fn()} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
