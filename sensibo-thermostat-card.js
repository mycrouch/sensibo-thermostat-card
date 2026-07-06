/* sensibo-thermostat-card v1.1.0
 * Thermostat-style card for Sensibo devices with mode-coloured background,
 * dedicated power button, mode + fan selection (staged while off, live while on),
 * and native Sensibo off-timer (arms on power-on / re-arms on change / resets on power-off).
 * Config (GUI editable): entity (climate), name, default_minutes, step_minutes.
 * Optional YAML overrides: timer_switch, timer_end, colors:{mode:css-gradient}.
 */
(() => {
  const ICONS = {
    cool: "mdi:snowflake",
    heat: "mdi:fire",
    heat_cool: "mdi:autorenew",
    auto: "mdi:thermostat-auto",
    dry: "mdi:water-percent",
    fan_only: "mdi:fan",
  };
  const FAN_LABELS = {
    auto: "A",
    quiet: "Q",
    low: "L",
    medium: "M",
    medium_high: "M+",
    high: "H",
    strong: "S",
  };
  const COLORS = {
    heat: "linear-gradient(160deg,#3b1006,#8a3413 55%,#c05621)",
    cool: "linear-gradient(160deg,#062136,#0b4f79 55%,#1a7db0)",
    dry: "linear-gradient(160deg,#332300,#8a5a00 55%,#c98a1b)",
    fan_only: "linear-gradient(160deg,#04211e,#0c554c 55%,#1b8577)",
    heat_cool: "linear-gradient(160deg,#0c2410,#2c6b33 55%,#4a9b52)",
    auto: "linear-gradient(160deg,#0c2410,#2c6b33 55%,#4a9b52)",
    off: "linear-gradient(160deg,#191c20,#272c33 55%,#343b44)",
  };
  const fmtDur = (m) => {
    if (!m || m <= 0) return "Off";
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  };
  const fmtCount = (s) => {
    if (s < 0) s = 0;
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = Math.floor(s % 60);
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  };
  const store = (k, v) => {
    try { localStorage.setItem(k, v); } catch (e) {}
  };
  const load = (k) => {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  };

  class SensiboThermostatCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement("sensibo-thermostat-card-editor");
    }
    static getStubConfig(hass) {
      const ent =
        Object.keys(hass?.states || {}).find(
          (e) => e.startsWith("climate.") && e.includes("sensibo")
        ) || "";
      return { entity: ent, default_minutes: 60, step_minutes: 30 };
    }

    setConfig(config) {
      if (!config.entity || !config.entity.startsWith("climate."))
        throw new Error("Set a climate entity");
      const slug = config.entity.slice(8);
      this._c = {
        step_minutes: 30,
        default_minutes: 60,
        timer_switch: `switch.${slug}_timer`,
        timer_end: `sensor.${slug}_timer_end_time`,
        ...config,
      };
      if (this._pending === undefined)
        this._pending = this._c.default_minutes;
      this._selMode = load(`stc-mode-${this._c.entity}`) || "cool";
      this._selFan = load(`stc-fan-${this._c.entity}`) || null;
      this._sig = null;
      if (this.shadowRoot && this._hass) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      const st = hass.states[this._c.entity];
      const sw = hass.states[this._c.timer_switch];
      const end = hass.states[this._c.timer_end];
      // While on, live state is the source of truth for mode/fan selection
      if (st && st.state !== "off") {
        this._selMode = st.state;
        this._selFan = st.attributes.fan_mode || this._selFan;
      }
      const sig = JSON.stringify([
        st?.state,
        st?.attributes?.temperature,
        st?.attributes?.current_temperature,
        st?.attributes?.current_humidity,
        st?.attributes?.fan_mode,
        sw?.state,
        end?.state,
        this._pending,
        this._selMode,
        this._selFan,
      ]);
      if (sig !== this._sig) {
        this._sig = sig;
        this._render();
      }
      this._syncTick();
    }

    getCardSize() {
      return 6;
    }

    _st() {
      return this._hass?.states[this._c.entity];
    }
    _on() {
      const st = this._st();
      return st && st.state !== "off";
    }
    _timerActive() {
      const sw = this._hass?.states[this._c.timer_switch];
      const end = this._hass?.states[this._c.timer_end];
      return (
        sw?.state === "on" &&
        end &&
        end.state !== "unknown" &&
        end.state !== "unavailable" &&
        new Date(end.state).getTime() > Date.now()
      );
    }
    _remainMin() {
      const end = this._hass?.states[this._c.timer_end];
      if (!end) return 0;
      return Math.max(
        0,
        Math.round((new Date(end.state).getTime() - Date.now()) / 60000)
      );
    }
    _svc(d, s, data) {
      this._hass.callService(d, s, data);
    }
    _armTimer(minutes) {
      this._svc("sensibo", "enable_timer", {
        entity_id: this._c.entity,
        minutes,
      });
    }
    _cancelTimer() {
      this._svc("switch", "turn_off", { entity_id: this._c.timer_switch });
    }

    _render() {
      const st = this._st();
      if (!st) {
        this.shadowRoot.innerHTML = `<ha-card style="padding:16px">Entity ${this._c.entity} not found</ha-card>`;
        return;
      }
      const a = st.attributes;
      const on = this._on();
      const dispMode = on ? st.state : "off";
      const colors = { ...COLORS, ...(this._c.colors || {}) };
      const bg = colors[dispMode] || COLORS.off;
      const name = this._c.name || a.friendly_name || this._c.entity;
      const modes = (a.hvac_modes || []).filter((m) => m !== "off" && ICONS[m]);
      const fans = a.fan_modes || [];
      const hasTarget = a.temperature != null;
      const active = this._timerActive();
      const selMode = this._selMode;
      const selFan = on ? a.fan_mode : this._selFan || a.fan_mode;

      this.shadowRoot.innerHTML = `
<style>
  ha-card{background:${bg};color:#fff;padding:18px;border-radius:var(--ha-card-border-radius,14px);transition:background .6s ease;}
  .hdr{display:flex;align-items:center;gap:12px;}
  .pwr{width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:${
    on ? "#fff" : "rgba(255,255,255,.08)"
  };color:${on ? "#333" : "#fff"};cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;transition:all .3s;}
  .pwr ha-icon{--mdc-icon-size:26px;}
  .name{font-size:1.15rem;font-weight:500;flex:1;}
  .big{font-size:2.6rem;font-weight:300;line-height:1;}
  .big sup{font-size:1rem;font-weight:400;opacity:.8;}
  .setrow{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 4px;background:rgba(255,255,255,.10);border-radius:12px;padding:10px 14px;}
  .setlbl{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;opacity:.8;}
  .stepper{display:flex;align-items:center;gap:14px;}
  .rbtn{width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.16);color:#fff;font-size:1.25rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .rbtn:active{background:rgba(255,255,255,.35);}
  .sval{min-width:52px;text-align:center;font-size:1.25rem;font-weight:500;font-variant-numeric:tabular-nums;}
  .cur{font-size:.85rem;opacity:.75;}
  .timer{display:flex;align-items:center;justify-content:space-between;margin:10px 2px 4px;background:rgba(0,0,0,.22);border-radius:12px;padding:10px 14px;}
  .count{font-variant-numeric:tabular-nums;font-size:1.3rem;font-weight:500;}
  .secs{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}
  .sec{flex:1;min-width:230px;}
  .seclbl{text-align:center;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin-bottom:8px;}
  .btnrow{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
  .mbtn{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;background:rgba(0,0,0,.25);color:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;font-size:.95rem;font-weight:600;}
  .mbtn.sel{background:#fff;color:#333;box-shadow:0 2px 8px rgba(0,0,0,.4);}
  .mbtn ha-icon{--mdc-icon-size:22px;}
  .hint{font-size:.72rem;opacity:.6;margin-top:8px;text-align:center;}
</style>
<ha-card>
  <div class="hdr">
    <button class="pwr" id="pwr" title="Power"><ha-icon icon="mdi:power"></ha-icon></button>
    <div class="name">${name}</div>
    <div class="big">${hasTarget ? a.temperature : "—"}<sup>°C</sup></div>
  </div>

  ${hasTarget ? `
  <div class="setrow">
    <div class="setlbl">Set</div>
    <div class="stepper">
      <button class="rbtn" id="tdn">−</button>
      <div class="sval">${a.temperature}°</div>
      <button class="rbtn" id="tup">+</button>
    </div>
    <div class="cur">${a.current_temperature != null ? a.current_temperature + "°" : ""}${
      a.current_humidity != null
        ? " · " + Math.round(a.current_humidity) + "%"
        : ""
    }</div>
  </div>` : ""}

  <div class="timer">
    <div class="setlbl">Timer</div>
    ${
      active
        ? `<div class="count" id="count">--:--</div>
           <div class="stepper">
             <button class="rbtn" id="sdn">−</button>
             <button class="rbtn" id="sup">+</button>
             <button class="rbtn" id="tcancel" title="Cancel timer">✕</button>
           </div>`
        : `<div class="stepper">
             <button class="rbtn" id="sdn">−</button>
             <div class="sval" style="min-width:64px;font-size:1.05rem;">${fmtDur(this._pending)}</div>
             <button class="rbtn" id="sup">+</button>
           </div>`
    }
  </div>
  ${
    !active && !on && this._pending > 0
      ? `<div class="hint">Timer starts at power on — AC will run for ${fmtDur(this._pending)}</div>`
      : ""
  }

  <div class="secs">
    <div class="sec">
      <div class="seclbl">Mode · ${(selMode || "").replace("_", " ")}</div>
      <div class="btnrow">
        ${modes
          .map(
            (m) =>
              `<button class="mbtn mode${m === selMode ? " sel" : ""}" data-v="${m}" title="${m}"><ha-icon icon="${ICONS[m]}"></ha-icon></button>`
          )
          .join("")}
      </div>
    </div>
    <div class="sec">
      <div class="seclbl">Fan · ${selFan || "—"}</div>
      <div class="btnrow">
        ${fans
          .map(
            (f) =>
              `<button class="mbtn fan${f === selFan ? " sel" : ""}" data-v="${f}" title="${f}">${FAN_LABELS[f] || f[0].toUpperCase()}</button>`
          )
          .join("")}
      </div>
    </div>
  </div>
</ha-card>`;

      const $ = (id) => this.shadowRoot.getElementById(id);

      $("pwr").onclick = () => this._power();

      if (hasTarget) {
        const step = a.target_temp_step || 1;
        $("tup").onclick = () =>
          this._svc("climate", "set_temperature", {
            entity_id: this._c.entity,
            temperature: Math.min(a.max_temp ?? 31, a.temperature + step),
          });
        $("tdn").onclick = () =>
          this._svc("climate", "set_temperature", {
            entity_id: this._c.entity,
            temperature: Math.max(a.min_temp ?? 10, a.temperature - step),
          });
      }

      this.shadowRoot.querySelectorAll(".mbtn.mode").forEach((b) => {
        b.onclick = () => this._pickMode(b.dataset.v);
      });
      this.shadowRoot.querySelectorAll(".mbtn.fan").forEach((b) => {
        b.onclick = () => this._pickFan(b.dataset.v);
      });

      $("sup").onclick = () => this._stepTimer(+1);
      $("sdn").onclick = () => this._stepTimer(-1);
      if (active) {
        $("tcancel").onclick = () => {
          this._cancelTimer(); // AC keeps running, timer off
          this._pending = 0;
        };
        this._updateCount();
      }
      this._syncTick();
    }

    _power() {
      if (this._on()) {
        // Manual off: reset timer to off
        this._svc("climate", "set_hvac_mode", {
          entity_id: this._c.entity,
          hvac_mode: "off",
        });
        this._cancelTimer();
        this._pending = 0;
        this._sig = null;
        this._render();
        return;
      }
      // Power on: apply staged mode + fan, then arm timer if set
      this._svc("climate", "set_hvac_mode", {
        entity_id: this._c.entity,
        hvac_mode: this._selMode || "cool",
      });
      const fan = this._selFan;
      setTimeout(() => {
        if (fan)
          this._svc("climate", "set_fan_mode", {
            entity_id: this._c.entity,
            fan_mode: fan,
          });
        if (this._pending > 0)
          setTimeout(() => this._armTimer(this._pending), 600);
      }, 700);
    }

    _pickMode(m) {
      this._selMode = m;
      store(`stc-mode-${this._c.entity}`, m);
      if (this._on())
        this._svc("climate", "set_hvac_mode", {
          entity_id: this._c.entity,
          hvac_mode: m,
        });
      this._sig = null;
      this._render();
    }

    _pickFan(f) {
      this._selFan = f;
      store(`stc-fan-${this._c.entity}`, f);
      if (this._on())
        this._svc("climate", "set_fan_mode", {
          entity_id: this._c.entity,
          fan_mode: f,
        });
      this._sig = null;
      this._render();
    }

    _stepTimer(dir) {
      const step = this._c.step_minutes;
      if (this._timerActive()) {
        // Adjust the running timer's remaining time, re-arm (debounced)
        this._adjust = (this._adjust ?? this._remainMin()) + dir * step;
        if (this._adjust < 0) this._adjust = 0;
        clearTimeout(this._deb);
        this._deb = setTimeout(() => {
          const mins = this._adjust;
          this._adjust = undefined;
          if (mins > 0) this._armTimer(mins);
          else this._cancelTimer(); // stepped to zero: cancel timer, AC keeps running
        }, 1200);
        // Optimistic label update while adjusting
        const el = this.shadowRoot.getElementById("count");
        if (el) el.textContent = fmtDur(this._adjust);
        return;
      }
      this._pending = Math.max(0, (this._pending || 0) + dir * step);
      this._sig = null;
      this._render();
      // If AC already on with no timer running, arm it (debounced)
      clearTimeout(this._deb);
      if (this._on() && this._pending > 0) {
        this._deb = setTimeout(() => this._armTimer(this._pending), 1200);
      }
    }

    _updateCount() {
      if (this._adjust !== undefined) return; // user mid-adjust
      const el = this.shadowRoot && this.shadowRoot.getElementById("count");
      const end = this._hass?.states[this._c.timer_end];
      if (!el || !end) return;
      const secs = (new Date(end.state).getTime() - Date.now()) / 1000;
      el.textContent = fmtCount(secs);
    }

    _syncTick() {
      const need = this._timerActive();
      if (need && !this._tick) {
        this._tick = setInterval(() => {
          if (!this._timerActive()) {
            clearInterval(this._tick);
            this._tick = null;
            this._sig = null;
            this._render();
            return;
          }
          this._updateCount();
        }, 1000);
      } else if (!need && this._tick) {
        clearInterval(this._tick);
        this._tick = null;
      }
    }

    disconnectedCallback() {
      if (this._tick) {
        clearInterval(this._tick);
        this._tick = null;
      }
    }
  }

  class SensiboThermostatCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this._render();
    }
    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
    }
    _render() {
      if (!this._form) {
        this.innerHTML = "";
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) =>
          ({
            entity: "Climate entity (Sensibo)",
            name: "Name (optional)",
            default_minutes: "Default timer (minutes, 0 = off)",
            step_minutes: "Timer step (minutes)",
          }[s.name] || s.name);
        this._form.schema = [
          {
            name: "entity",
            required: true,
            selector: { entity: { domain: "climate" } },
          },
          { name: "name", selector: { text: {} } },
          {
            name: "default_minutes",
            selector: { number: { min: 0, step: 15, mode: "box" } },
          },
          {
            name: "step_minutes",
            selector: { number: { min: 5, step: 5, mode: "box" } },
          },
        ];
        this._form.addEventListener("value-changed", (ev) => {
          const config = {
            type: "custom:sensibo-thermostat-card",
            ...ev.detail.value,
          };
          this.dispatchEvent(
            new CustomEvent("config-changed", {
              detail: { config },
              bubbles: true,
              composed: true,
            })
          );
        });
        this.appendChild(this._form);
      }
      if (this._hass) this._form.hass = this._hass;
      this._form.data = {
        default_minutes: 60,
        step_minutes: 30,
        ...this._config,
      };
    }
  }

  customElements.define("sensibo-thermostat-card", SensiboThermostatCard);
  customElements.define(
    "sensibo-thermostat-card-editor",
    SensiboThermostatCardEditor
  );
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "sensibo-thermostat-card",
    name: "Sensibo Thermostat Card",
    description:
      "Thermostat-style Sensibo card with power button, mode/fan controls, mode-coloured background and off-timer countdown.",
    preview: true,
  });
})();
