import { Activity, Radio, SlidersHorizontal, Users, X } from "lucide-react";
import type { SimulationSettings } from "../api/mockPipelineApi";

interface SimulationPanelProps {
  open: boolean;
  settings: SimulationSettings;
  selectedDealName?: string;
  onSettingsChange: (settings: Partial<SimulationSettings>) => void;
  onSimulateTeammate: () => void;
  onClose: () => void;
}

export function SimulationPanel({
  open,
  settings,
  selectedDealName,
  onSettingsChange,
  onSimulateTeammate,
  onClose,
}: SimulationPanelProps) {
  if (!open) return null;

  return (
    <section
      id="simulation-panel"
      className="simulator-panel"
      aria-label="Simulation controls"
    >
      <div className="simulator-heading">
        <div className="simulator-title">
          <span className="simulator-icon">
            <SlidersHorizontal size={17} />
          </span>
          <div>
            <h2>Simulation controls</h2>
            <p>Shape the network conditions for your walkthrough.</p>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close simulation controls"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>

      <div className="simulator-controls">
        <label className="range-control">
          <span>
            <span>Save latency</span>
            <strong>{settings.latencyMs.toLocaleString()} ms</strong>
          </span>
          <input
            type="range"
            min="300"
            max="1500"
            step="100"
            value={settings.latencyMs}
            aria-label="Save latency"
            onChange={(event) =>
              onSettingsChange({ latencyMs: Number(event.target.value) })
            }
          />
          <span className="range-ends">
            <span>Fast</span>
            <span>Slow</span>
          </span>
        </label>

        <label className="range-control">
          <span>
            <span>Failed saves</span>
            <strong>{Math.round(settings.failureRate * 100)}%</strong>
          </span>
          <input
            type="range"
            min="0"
            max="30"
            step="5"
            value={Math.round(settings.failureRate * 100)}
            aria-label="Failed save rate"
            onChange={(event) =>
              onSettingsChange({
                failureRate: Number(event.target.value) / 100,
              })
            }
          />
          <span className="range-ends">
            <span>0%</span>
            <span>30%</span>
          </span>
        </label>

        <label className="auto-updates-control">
          <span className="auto-updates-copy">
            <span className="setting-icon setting-icon-green">
              <Radio size={16} />
            </span>
            <span>
              <strong>Live teammate updates</strong>
              <small>Update the selected deal every 8 seconds</small>
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.autoTeammate}
            aria-label="Enable live teammate updates"
            onChange={(event) =>
              onSettingsChange({ autoTeammate: event.target.checked })
            }
          />
        </label>
      </div>

      <div className="simulator-footer">
        <div className="simulator-footer-copy">
          <span>
            <Activity size={14} />
            Changes apply immediately
          </span>
          <small>
            {selectedDealName
              ? `Only ${selectedDealName} will be changed.`
              : "Select exactly one open deal in the table to enable teammate edits."}
          </small>
        </div>
        <button
          className="button button-secondary button-small"
          type="button"
          title={
            selectedDealName
              ? `Apply a teammate change to ${selectedDealName}`
              : "Select exactly one open deal to simulate a teammate edit"
          }
          disabled={!selectedDealName}
          onClick={onSimulateTeammate}
        >
          <Users size={15} />
          {selectedDealName ? "Edit selected deal" : "Select one deal"}
        </button>
      </div>
    </section>
  );
}
