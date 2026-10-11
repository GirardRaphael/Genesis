import { ChartNoAxesCombined, Map, Network, X } from "lucide-react";
import { roleName } from "./Observability";
import { statusLabel } from "./state";
import type { Selection, View } from "./state";

const navigation = [
  { id: "dispatch", label: "Opérations", icon: Map },
  { id: "analytics", label: "Analytique", icon: ChartNoAxesCombined },
  { id: "observatory", label: "Agents", icon: Network },
] as const;

export function workspaceFor(view: View) {
  return view === "dispatch" || view === "analytics" ? view : "observatory";
}

export function WorkspaceNavigation({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const workspace = workspaceFor(view);
  return (
    <nav aria-label="Navigation principale">
      {navigation.map((item) => (
        <button
          type="button"
          key={item.id}
          className={workspace === item.id ? "active" : ""}
          onClick={() => onNavigate(item.id)}
          aria-label={item.label}
          title={item.label}
          aria-current={workspace === item.id ? "page" : undefined}
        >
          <item.icon size={18} aria-hidden="true" />
          <span>{item.label}</span>
          {workspace === item.id && <i aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}

export function AgentViewSelector({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  if (workspaceFor(view) !== "observatory") return null;
  return (
    <div className="agent-context">
      <label>
        Dossier des agents
        <select
          value={view}
          onChange={(event) => onNavigate(event.target.value as View)}
        >
          <option value="observatory">Activité et appels individuels</option>
          <option value="runs">Historique des exécutions</option>
          <option value="compare">Comparer deux exécutions</option>
          <option value="overview">Résumé de l’exécution</option>
          <option value="fleet">Plan de livraison simulé</option>
        </select>
      </label>
      <p>
        Une exécution, ses décisions et ses preuves. Les indicateurs globaux
        sont dans Analytique.
      </p>
    </div>
  );
}

export const clearedFilters = {
  scenario: "",
  status: "",
  policy: "",
  agent: "",
  model: "",
  query: "",
};

export function selectionFilters(selection: Selection) {
  return [
    { key: "scenario", label: "Scénario", value: selection.scenario },
    {
      key: "policy",
      label: "Politique",
      value:
        selection.policy === "baseline_only"
          ? "Référence"
          : selection.policy === "solver_with_one_replan"
            ? "Solveur + replanification"
            : selection.policy,
    },
    { key: "status", label: "Statut", value: statusLabel(selection.status) },
    {
      key: "agent",
      label: "Agent",
      value: selection.agent ? roleName(selection.agent) : "",
    },
    { key: "model", label: "Modèle", value: selection.model },
    {
      key: "query",
      label: "Recherche locale",
      value: selection.view === "runs" ? selection.query : "",
    },
  ].filter((filter) => filter.value);
}

export function ActiveFilters({
  selection,
  onChange,
}: {
  selection: Selection;
  onChange: (change: Partial<Selection>) => void;
}) {
  const filters = selectionFilters(selection);
  if (!filters.length) return null;
  return (
    <div className="active-filters" aria-label="Filtres actifs">
      <span className="filter-summary-label">
        {filters.length} filtre{filters.length > 1 ? "s" : ""} actif
        {filters.length > 1 ? "s" : ""}
      </span>
      {filters.map((filter) => (
        <button
          type="button"
          key={filter.key}
          className="filter-chip"
          aria-label={`Retirer le filtre ${filter.label} : ${filter.value}`}
          onClick={() => onChange({ [filter.key]: "" })}
        >
          <span>
            {filter.label} : <strong>{filter.value}</strong>
          </span>
          <X size={13} aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        className="clear-filters"
        onClick={() => onChange(clearedFilters)}
      >
        Tout effacer
      </button>
    </div>
  );
}
