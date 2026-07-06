/* sensibo-thermostat-card v1.2.0
 * Thermostat-style card for Sensibo devices. Pastel mode-coloured background,
 * dedicated power button, mode buttons ("Auto" label for heat_cool), fan-speed
 * and timer dropdowns side by side, native Sensibo off-timer with countdown.
 * Incremental DOM updates (no full re-render) so the page never scroll-jumps.
 * Config (GUI editable): entity (climate), name, default_minutes.
 * YAML extras: timer_options:[minutes], timer_switch, timer_end, colors:{mode:css}.
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
  const modeLabel = (m) =>
    m === "heat_cool" ? "Auto" : (m || "").replace("_", " ");
  const fanLabel = (f) => (f || "").replace("_", " ");
  const COLORS = {
    heat: "linear-gradient(160deg,#ffe3d5,#ffc4a8)",
    cool: "linear-gradient(160deg,#d9ecff,#aed4f2)",
    dry: "linear-gradient(160deg,#fff3cf,#ffe19a)",
    fan_only: "linear-gradient(160deg,#d5f0eb,#a8ddd3)",
    heat_cool: "linear-gradient(160deg,#ddf0d8,#b5dcac)",
    auto: "linear-gradient(160deg,#ddf0d8,#b5dcac)",
    off: "linear-gradient(160deg,#e8eaee,#d2d6dc)",
  };
  const DEFAULT_TIMER_OPTIONS = [0, 30, 60, 90, 120, 180, 240, 360, 480];
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
      return { entity: ent, default_minutes: 60 };
    }

    setConfig(config) {
      if (!config.entity || !config.entity.startsWith("climate."))
        throw new Error("Set a climate entity");
      const slug = config.entity.slice(8);
      this._c = {
        default_minutes: 60,
        timer_options: DEFAULT_TIMER_OPTIONS,
        timer_switch: `switch.${slug}_timer`,
        timer_end: `sensor.${slug}_timer_end_time`,
        ...config,
      };
      if (this._pending === undefined)
        this._pending = this._c.default_minutes;
      this._selMode = load(`stc-mode-${this._c.entity}`) || "cool";
      this._selFan = load(`stc-fan-${this._c.entity}`) || null;
      this._built = false;
      if (this._hass) this._buildAndUpdate();
    }

    set hass(hass) {
      this._hass = hass;
      const st = hass.states[this._c.entity];
      if (st && st.state !== "off") {
        this._selMode = st.state;
        this._selFan = st.attributes.fan_mode || this._selFan;
      }
      this._buildAndUpdate();
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

    _buildAndUpdate() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      const st = this._st();
      if (!st) {
        if (!this._errShown) {
          this.shadowRoot.innerHTML = `<ha-card style="padding:16px">Entity ${this._c.entity} not found</ha-card>`;
          this._errShown = true;
          this._built = false;
        }
        return;
      }
      this._errShown = false;
      const a = st.attributes;
      const modesKey = JSON.stringify([a.hvac_modes, a.fan_modes]);
      if (!this._built || this._modesKey !== modesKey) {
        this._modesKey = modesKey;
        this._build(a);
      }
      this._update();
    }

    _build(a) {
      const modes = (a.hvac_modes || []).filter((m) => m !== "off" && ICONS[m]);
      const fans = a.fan_modes || [];
      const topts = [...this._c.timer_options];

      this.shadowRoot.innerHTML = `
<style>
  ha-card{color:#2b2d31;padding:18px;border-radius:var(--ha-card-border-radius,14px);transition:background .6s ease;}
  .hdr{display:flex;align-items:center;gap:12px;}
  .pwr{width:48px;height:48px;border-radius:50%;border:2px solid rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;transition:all .3s;background:rgba(255,255,255,.4);color:#2b2d31;}
  .pwr.on{background:#2b2d31;color:#fff;border-color:#2b2d31;}
  .pwr ha-icon{--mdc-icon-size:26px;}
  .name{font-size:1.15rem;font-weight:500;flex:1;}
  .big{font-size:2.6rem;font-weight:300;line-height:1;}
  .big sup{font-size:1rem;font-weight:400;opacity:.7;}
  .setrow{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 4px;background:rgba(255,255,255,.45);border-radius:12px;padding:10px 14px;}
  .lbl{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;opacity:.65;}
  .stepper{display:flex;align-items:center;gap:14px;}
  .rbtn{width:36px;height:36px;border-radius:50%;border:none;background:rgba(0,0,0,.1);color:#2b2d31;font-size:1.25rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .rbtn:active{background:rgba(0,0,0,.25);}
  .sval{min-width:52px;text-align:center;font-size:1.25rem;font-weight:500;font-variant-numeric:tabular-nums;}
  .cur{font-size:.85rem;opacity:.65;}
  .modes{margin-top:16px;}
  .seclbl{text-align:center;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;opacity:.65;margin-bottom:8px;}
  .btnrow{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
  .mbtn{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;background:rgba(0,0,0,.08);color:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;}
  .mbtn.sel{background:#2b2d31;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);}
  .mbtn ha-icon{--mdc-icon-size:22px;}
  .bottom{display:flex;gap:10px;margin-top:16px;}
  .dd{flex:1;background:rgba(255,255,255,.45);border-radius:12px;padding:10px 12px;}
  .dd .lbl{display:block;margin-bottom:6px;}
  select{width:100%;border:none;border-radius:8px;padding:8px 10px;font-size:.95rem;background:rgba(255,255,255,.7);color:#2b2d31;cursor:pointer;outline:none;appearance:auto;}
  .hint{font-size:.72rem;opacity:.55;margin-top:8px;text-align:center;}
</style>
<ha-card>
  <div class="hdr">
    <button type="button" class="pwr" id="pwr" title="Power"><ha-icon icon="mdi:power"></ha-icon></button>
    <div class="name" id="name"></div>
    <div class="big"><span id="bigval">—</span><sup>°C</sup></div>
  </div>

  <div class="setrow" id="setrow">
    <div class="lbl">Set</div>
    <div class="stepper">
      <button type="button" class="rbtn" id="tdn">−</button>
      <div class="sval" id="setval">—</div>
      <button type="button" class="rbtn" id="tup">+</button>
    </div>
    <div class="cur" id="cur"></div>
  </div>

  <div class="modes">
    <div class="seclbl" id="modelbl">Mode</div>
    <div class="btnrow">
      ${modes
        .map(
          (m) =>
            `<button type="button" class="mbtn mode" data-v="${m}" title="${modeLabel(m)}"><ha-icon icon="${ICONS[m]}"></ha-icon></button>`
        )
        .join("")}
    </div>
  </div>

  <div class="bottom">
    <div class="dd">
      <span class="lbl">Fan speed</span>
      <select id="fansel">
        ${fans
          .map((f) => `<option value="${f}">${fanLabel(f)}</option>`)
          .join("")}
      </select>
    </div>
    <div class="dd">
      <span class="lbl" id="timerlbl">Timer</span>
      <select id="timersel">
        ${topts
          .map((m) => `<option value="${m}">${fmtDur(m)}</option>`)
          .join("")}
      </select>
    </div>
  </div>
  <div class="hint" id="hint"></div>
</ha-card>`;

      const $ = (id) => this.shadowRoot.getElementById(id);
      this._el = {
        card: this.shadowRoot.querySelector("ha-card"),
        pwr: $("pwr"),
        name: $("name"),
        bigval: $("bigval"),
        setrow: $("setrow"),
        setval: $("setval"),
        cur: $("cur"),
        modelbl: $("modelbl"),
        modeBtns: [...this.shadowRoot.querySelectorAll(".mbtn.mode")],
        fansel: $("fansel"),
        timerlbl: $("timerlbl"),
        timersel: $("timersel"),
        hint: $("hint"),
        tup: $("tup"),
        tdn: $("tdn"),
      };

      this._el.pwr.onclick = () => this._power();
      this._el.tup.onclick = () => this._nudgeTemp(+1);
      this._el.tdn.onclick = () => this._nudgeTemp(-1);
      this._el.modeBtns.forEach((b) => {
        b.onclick = () => this._pickMode(b.dataset.v);
      });
      this._el.fansel.onchange = (e) => this._pickFan(e.target.value);
      this._el.timersel.onchange = (e) =>
        this._pickTimer(parseInt(e.target.value, 10));

      this._built = true;
    }

    _update() {
      const st = this._st();
      if (!st || !this._built) return;
      const a = st.attributes;
      const on = this._on();
      const dispMode = on ? st.state : "off";
      const colors = { ...COLORS, ...(this._c.colors || {}) };
      const e = this._el;

      e.card.style.background = colors[dispMode] || COLORS.off;
      e.pwr.classList.toggle("on", on);
      e.name.textContent =
        this._c.name || a.friendly_name || this._c.entity;

      const hasTarget = a.temperature != null;
      e.setrow.style.display = hasTarget ? "" : "none";
      e.bigval.textContent = hasTarget ? a.temperature : "—";
      e.setval.textContent = hasTarget ? a.temperature + "°" : "—";
      e.cur.textContent =
        (a.current_temperature != null ? a.current_temperature + "°" : "") +
        (a.current_humidity != null
          ? " · " + Math.round(a.current_humidity) + "%"
          : "");

      e.modelbl.textContent = "Mode · " + modeLabel(this._selMode);
      e.modeBtns.forEach((b) =>
        b.classList.toggle("sel", b.dataset.v === this._selMode)
      );

      const selFan = on ? a.fan_mode : this._selFan || a.fan_mode;
      if (selFan != null && e.fansel.value !== selFan && document.activeElement !== e.fansel)
        e.fansel.value = selFan;

      const active = this._timerActive();
      if (!active) {
        e.timerlbl.textContent = "Timer";
        this._ensureTimerOption(this._pending);
        if (document.activeElement !== e.timersel)
          e.timersel.value = String(this._pending);
        e.hint.textContent =
          !on && this._pending > 0
            ? `Timer starts at power on — AC will run for ${fmtDur(this._pending)}`
            : "";
      } else {
        this._updateCount();
        e.hint.textContent = "";
      }
    }

    _ensureTimerOption(mins) {
      const sel = this._el.timersel;
      if (![...sel.options].some((o) => o.value === String(mins))) {
        const opt = document.createElement("option");
        opt.value = String(mins);
        opt.textContent = fmtDur(mins);
        const bigger = [...sel.options].find(
          (o) => parseInt(o.value, 10) > mins
        );
        sel.insertBefore(opt, bigger || null);
      }
    }

    _nudgeTemp(dir) {
      const a = this._st()?.attributes || {};
      if (a.temperature == null) return;
      const step = a.target_temp_step || 1;
      const t = Math.min(
        a.max_temp ?? 31,
        Math.max(a.min_temp ?? 10, a.temperature + dir * step)
      );
      this._svc("climate", "set_temperature", {
        entity_id: this._c.entity,
        temperature: t,
      });
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
        this._update();
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
      this._update();
    }

    _pickMode(m) {
      this._selMode = m;
      store(`stc-mode-${this._c.entity}`, m);
      if (this._on())
        this._svc("climate", "set_hvac_mode", {
          entity_id: this._c.entity,
          hvac_mode: m,
        });
      this._update();
    }

    _pickFan(f) {
      this._selFan = f;
      store(`stc-fan-${this._c.entity}`, f);
      if (this._on())
        this._svc("climate", "set_fan_mode", {
          entity_id: this._c.entity,
          fan_mode: f,
        });
      this._update();
    }

    _pickTimer(mins) {
      this._pending = mins;
      if (this._timerActive() || this._on()) {
        // Running (or timer mid-flight): apply the new value now
        if (mins > 0) this._armTimer(mins);
        else this._cancelTimer(); // Off selected: cancel timer, AC keeps running
      }
      this._update();
    }

    _updateCount() {
      const end = this._hass?.states[this._c.timer_end];
      if (!end || !this._el) return;
      const secs = (new Date(end.state).getTime() - Date.now()) / 1000;
      this._el.timerlbl.textContent = "Timer · " + fmtCount(secs);
    }

    _syncTick() {
      const need = this._timerActive();
      if (need && !this._tick) {
        this._tick = setInterval(() => {
          if (!this._timerActive()) {
            clearInterval(this._tick);
            this._tick = null;
            this._pending = 0;
            this._update();
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
      this._form.data = { default_minutes: 60, ...this._config };
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
      "Thermostat-style Sensibo card with power button, mode buttons, fan/timer dropdowns and pastel mode-coloured background.",
    preview: true,
  });
})();
