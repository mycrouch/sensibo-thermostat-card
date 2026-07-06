/* sensibo-thermostat-card v1.0.0
 * Thermostat-style card for Sensibo devices with mode-coloured background
 * and native Sensibo off-timer (set / countdown / auto-reset).
 * Config (GUI editable): entity (climate), name, default_minutes, step_minutes.
 * Optional YAML overrides: timer_switch, timer_end, colors:{mode:css-gradient}.
 */
(() => {
  const MODES = ["cool", "heat", "heat_cool", "dry", "fan_only", "off"];
  const ICONS = {
    cool: "mdi:snowflake",
    heat: "mdi:fire",
    heat_cool: "mdi:autorenew",
    auto: "mdi:thermostat-auto",
    dry: "mdi:water-percent",
    fan_only: "mdi:fan",
    off: "mdi:power",
  };
  const COLORS = {
    heat: "linear-gradient(145deg,#d84315,#ff7043)",
    cool: "linear-gradient(145deg,#0277bd,#29b6f6)",
    dry: "linear-gradient(145deg,#ff8f00,#ffca28)",
    fan_only: "linear-gradient(145deg,#00695c,#26a69a)",
    heat_cool: "linear-gradient(145deg,#2e7d32,#66bb6a)",
    auto: "linear-gradient(145deg,#2e7d32,#66bb6a)",
    off: "linear-gradient(145deg,#263238,#37474f)",
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

  class SensiboTimerCard extends HTMLElement {
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
      this._pending =
        this._pending === undefined ? this._c.default_minutes : this._pending;
      this._sig = null;
      if (this.shadowRoot) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      const st = hass.states[this._c.entity];
      const sw = hass.states[this._c.timer_switch];
      const end = hass.states[this._c.timer_end];
      const sig = JSON.stringify([
        st?.state,
        st?.attributes?.temperature,
        st?.attributes?.current_temperature,
        st?.attributes?.current_humidity,
        sw?.state,
        end?.state,
        this._pending,
      ]);
      if (sig !== this._sig) {
        this._sig = sig;
        this._render();
      }
      this._syncTick();
    }

    getCardSize() {
      return 5;
    }

    _st() {
      return this._hass?.states[this._c.entity];
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

    _render() {
      const st = this._st();
      if (!st) {
        this.shadowRoot.innerHTML = `<ha-card style="padding:16px">Entity ${this._c.entity} not found</ha-card>`;
        return;
      }
      const a = st.attributes;
      const mode = st.state;
      const colors = { ...COLORS, ...(this._c.colors || {}) };
      const bg = colors[mode] || COLORS.off;
      const name = this._c.name || a.friendly_name || this._c.entity;
      const modes = (a.hvac_modes || MODES).filter((m) => ICONS[m]);
      const hasTarget = a.temperature != null;
      const active = this._timerActive();
      const off = mode === "off";

      this.shadowRoot.innerHTML = `
<style>
  ha-card{background:${bg};color:#fff;padding:16px;border-radius:var(--ha-card-border-radius,12px);transition:background .6s ease;}
  .top{display:flex;justify-content:space-between;align-items:baseline;}
  .name{font-size:1.05rem;font-weight:500;opacity:.95;}
  .env{font-size:.85rem;opacity:.8;text-align:right;}
  .target{display:flex;align-items:center;justify-content:center;gap:20px;margin:14px 0 6px;}
  .temp{font-size:3.2rem;font-weight:300;line-height:1;}
  .temp small{font-size:1.2rem;font-weight:400;opacity:.8;}
  .tbtn{width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:1.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .tbtn:active{background:rgba(255,255,255,.35);}
  .modelbl{text-align:center;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-bottom:10px;}
  .modes{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
  .mbtn{width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;background:rgba(0,0,0,.22);color:rgba(255,255,255,.75);display:flex;align-items:center;justify-content:center;}
  .mbtn.sel{background:#fff;color:#333;box-shadow:0 2px 6px rgba(0,0,0,.35);}
  .mbtn ha-icon{--mdc-icon-size:22px;}
  .timer{margin-top:14px;background:rgba(0,0,0,.20);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;}
  .timer .lbl{display:flex;align-items:center;gap:8px;font-size:.9rem;opacity:.9;}
  .timer .lbl ha-icon{--mdc-icon-size:18px;}
  .count{font-variant-numeric:tabular-nums;font-size:1.35rem;font-weight:500;}
  .stepper{display:flex;align-items:center;gap:10px;}
  .sbtn{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:1.2rem;cursor:pointer;}
  .sval{min-width:58px;text-align:center;font-size:1rem;font-weight:500;}
  .hint{font-size:.72rem;opacity:.65;margin-top:6px;text-align:center;}
</style>
<ha-card>
  <div class="top">
    <div class="name">${name}</div>
    <div class="env">${a.current_temperature != null ? a.current_temperature + "°" : ""}${
        a.current_humidity != null
          ? " · " + Math.round(a.current_humidity) + "%"
          : ""
      }</div>
  </div>
  <div class="target">
    ${hasTarget ? `<button class="tbtn" id="tdn">−</button>` : ""}
    <div class="temp">${
      hasTarget ? a.temperature + "<small>°C</small>" : "—"
    }</div>
    ${hasTarget ? `<button class="tbtn" id="tup">+</button>` : ""}
  </div>
  <div class="modelbl">${off ? "Off" : mode.replace("_", " ")}</div>
  <div class="modes">
    ${modes
      .map(
        (m) =>
          `<button class="mbtn${m === mode ? " sel" : ""}" data-mode="${m}" title="${m}"><ha-icon icon="${ICONS[m]}"></ha-icon></button>`
      )
      .join("")}
  </div>
  <div class="timer">
    <div class="lbl"><ha-icon icon="mdi:timer-outline"></ha-icon>Timer</div>
    ${
      active
        ? `<div class="count" id="count">--:--</div><button class="sbtn" id="tcancel" title="Cancel timer">✕</button>`
        : `<div class="stepper">
             <button class="sbtn" id="sdn">−</button>
             <div class="sval">${fmtDur(this._pending)}</div>
             <button class="sbtn" id="sup">+</button>
           </div>`
    }
  </div>
  ${
    !active && !off && this._pending > 0
      ? `<div class="hint">AC turns off in ${fmtDur(this._pending)} — applies when set</div>`
      : !active && off && this._pending > 0
      ? `<div class="hint">Timer starts when AC is turned on</div>`
      : ""
  }
</ha-card>`;

      const $ = (id) => this.shadowRoot.getElementById(id);
      const call = (d, s, data) =>
        this._hass.callService(d, s, { entity_id: this._c.entity, ...data });

      if (hasTarget) {
        const step = a.target_temp_step || 1;
        $("tup").onclick = () =>
          call("climate", "set_temperature", {
            temperature: Math.min(a.max_temp ?? 31, a.temperature + step),
          });
        $("tdn").onclick = () =>
          call("climate", "set_temperature", {
            temperature: Math.max(a.min_temp ?? 10, a.temperature - step),
          });
      }

      this.shadowRoot.querySelectorAll(".mbtn").forEach((b) => {
        b.onclick = () => this._setMode(b.dataset.mode);
      });

      if (active) {
        $("tcancel").onclick = () => {
          this._hass.callService("switch", "turn_off", {
            entity_id: this._c.timer_switch,
          });
          this._pending = 0;
        };
        this._updateCount();
      } else {
        $("sup").onclick = () => this._stepTimer(+1);
        $("sdn").onclick = () => this._stepTimer(-1);
      }
      this._syncTick();
    }

    _setMode(m) {
      const st = this._st();
      const wasOff = st.state === "off";
      const call = (d, s, data) =>
        this._hass.callService(d, s, { entity_id: this._c.entity, ...data });
      if (m === "off") {
        call("climate", "set_hvac_mode", { hvac_mode: "off" });
        this._hass.callService("switch", "turn_off", {
          entity_id: this._c.timer_switch,
        });
        this._pending = 0; // off resets timer to 0
        this._sig = null;
        this._render();
        return;
      }
      call("climate", "set_hvac_mode", { hvac_mode: m });
      // Turning on from off with a pending duration -> start native off-timer
      if (wasOff && this._pending > 0) {
        setTimeout(
          () =>
            this._hass.callService("sensibo", "enable_timer", {
              entity_id: this._c.entity,
              minutes: this._pending,
            }),
          800
        );
      }
    }

    _stepTimer(dir) {
      const step = this._c.step_minutes;
      this._pending = Math.max(0, (this._pending || 0) + dir * step);
      this._sig = null;
      this._render();
      // If AC already on, apply after a pause (debounced)
      clearTimeout(this._deb);
      const st = this._st();
      if (st && st.state !== "off") {
        this._deb = setTimeout(() => {
          if (this._pending > 0)
            this._hass.callService("sensibo", "enable_timer", {
              entity_id: this._c.entity,
              minutes: this._pending,
            });
          else
            this._hass.callService("switch", "turn_off", {
              entity_id: this._c.timer_switch,
            });
        }, 1500);
      }
    }

    _updateCount() {
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

  class SensiboTimerCardEditor extends HTMLElement {
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
          const config = { type: "custom:sensibo-thermostat-card", ...ev.detail.value };
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

  customElements.define("sensibo-thermostat-card", SensiboTimerCard);
  customElements.define("sensibo-thermostat-card-editor", SensiboTimerCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "sensibo-thermostat-card",
    name: "Sensibo Thermostat Card",
    description:
      "Thermostat-style Sensibo card with mode-coloured background and off-timer countdown.",
    preview: true,
  });
})();
