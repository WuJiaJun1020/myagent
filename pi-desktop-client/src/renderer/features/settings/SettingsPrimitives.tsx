import type { ReactNode } from "react";

type SettingsGroupProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type SettingsRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <section className="settings-group">
      <header className="settings-group-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-group-card">{children}</div>
    </section>
  );
}

export function SettingsRow({ title, description, children }: SettingsRowProps) {
  return (
    <div className="settings-row">
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsSwitch({ checked, disabled = false, label, onChange }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-switch" aria-label={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
