/* sensibo-thermostat-card v1.6.1
 * Thermostat-style card for Sensibo devices. Pastel mode-coloured background,
 * dedicated power button, mode buttons ("Auto" label for heat_cool), fan-speed
 * and timer dropdowns side by side, native Sensibo off-timer with countdown.
 * Timer dropdown only shows while powered on; arms at power-on with the
 * configured start value. DOM is built once and updated in place (no rebuilds).
 * Config (GUI editable): entity, name, default_minutes, interval_minutes, max_minutes.
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
  const BG = {
    bold: {
      heat: "linear-gradient(160deg,#3b1006,#8a3413 55%,#c05621)",
      cool: "linear-gradient(160deg,#062136,#0b4f79 55%,#1a7db0)",
      dry: "linear-gradient(160deg,#332300,#8a5a00 55%,#c98a1b)",
      fan_only: "linear-gradient(160deg,#04211e,#0c554c 55%,#1b8577)",
      heat_cool: "linear-gradient(160deg,#0c2410,#2c6b33 55%,#4a9b52)",
      auto: "linear-gradient(160deg,#0c2410,#2c6b33 55%,#4a9b52)",
      off: "linear-gradient(160deg,#191c20,#272c33 55%,#343b44)",
    },
    pastel: {
      heat: "linear-gradient(160deg,#ffe3d5,#ffc4a8)",
      cool: "linear-gradient(160deg,#d9ecff,#aed4f2)",
      dry: "linear-gradient(160deg,#fff3cf,#ffe19a)",
      fan_only: "linear-gradient(160deg,#d5f0eb,#a8ddd3)",
      heat_cool: "linear-gradient(160deg,#ddf0d8,#b5dcac)",
      auto: "linear-gradient(160deg,#ddf0d8,#b5dcac)",
      off: "linear-gradient(160deg,#e8eaee,#d2d6dc)",
    },
  };
  const THEMES = {
    bold: {
      fg: "#fff",
      sub: "rgba(255,255,255,.72)",
      surface: "rgba(255,255,255,.12)",
      btnBg: "rgba(255,255,255,.16)",
      btnFg: "rgba(255,255,255,.75)",
      selBg: "#fff",
      selFg: "#2b2d31",
      selectBg: "rgba(255,255,255,.18)",
      pwrBorder: "rgba(255,255,255,.4)",
      pwrBg: "rgba(255,255,255,.1)",
      pwrFg: "#fff",
      pwrOnBg: "#fff",
      pwrOnFg: "#2b2d31",
    },
    pastel: {
      fg: "#2b2d31",
      sub: "rgba(0,0,0,.55)",
      surface: "rgba(255,255,255,.45)",
      btnBg: "rgba(0,0,0,.08)",
      btnFg: "rgba(0,0,0,.55)",
      selBg: "#2b2d31",
      selFg: "#fff",
      selectBg: "rgba(255,255,255,.7)",
      pwrBorder: "rgba(0,0,0,.3)",
      pwrBg: "rgba(255,255,255,.4)",
      pwrFg: "#2b2d31",
      pwrOnBg: "#2b2d31",
      pwrOnFg: "#fff",
    },
    default: {
      fg: "var(--primary-text-color)",
      sub: "var(--secondary-text-color)",
      surface: "rgba(127,127,127,.12)",
      btnBg: "rgba(127,127,127,.18)",
      btnFg: "var(--secondary-text-color)",
      selBg: "var(--primary-color)",
      selFg: "#fff",
      selectBg: "rgba(127,127,127,.15)",
      pwrBorder: "var(--divider-color,rgba(127,127,127,.5))",
      pwrBg: "transparent",
      pwrFg: "var(--primary-text-color)",
      pwrOnBg: "var(--primary-color)",
      pwrOnFg: "#fff",
    },
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
      return { entity: ent, default_minutes: 60 };
    }

    setConfig(config) {
      if (!config.entity || !config.entity.startsWith("climate."))
        throw new Error("Set a climate entity");
      const slug = config.entity.slice(8);
      this._c = {
        default_minutes: 60,
        interval_minutes: 10,
        max_minutes: 240,
        style: "pastel",
        timer_switch: `switch.${slug}_timer`,
        timer_end: `sensor.${slug}_timer_end_time`,
        ...config,
      };
      if (this._c.style === "light") this._c.style = "pastel"; // airtouch-card alias
      if (!THEMES[this._c.style]) this._c.style = "pastel";
      // Timer dropdown options: explicit list, or 0..max at interval steps
      if (!this._c.timer_options) {
        const step = Math.max(1, this._c.interval_minutes);
        const opts = [0];
        for (let m = step; m <= this._c.max_minutes; m += step) opts.push(m);
        this._c.timer_options = opts;
      }
      if (this._pending === undefined) this._pending = 0;
      this._selMode = load(`stc-mode-${this._c.entity}`) || "cool";
      // Fan is staged from the device's own remembered fan_mode (reported even
      // while off) — NOT persisted locally, so a stale per-browser value can
      // never trigger a redundant fan command (= extra AC beep) at power-on.
      this._selFan = null;
      this._fanDirty = false;
      this._built = false;
      if (this._hass) this._buildAndUpdate();
    }

    set hass(hass) {
      this._hass = hass;
      const st = hass.states[this._c.entity];
      if (st && st.state !== "off") {
        this._selMode = st.state;
        this._selFan = st.attributes.fan_mode || this._selFan;
        this._fanDirty = false; // live state rules while on
      } else if (st && !this._fanDirty) {
        // While off, track the device's remembered fan speed
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
      // Optimistic windows: after a power press, hold the target state for a
      // few seconds so integration state-bounce (on -> stale off -> on) doesn't flicker the card
      if (this._optOffUntil && Date.now() < this._optOffUntil) return false;
      if (this._optOnUntil && Date.now() < this._optOnUntil) return true;
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
      // Build once only — attribute-list changes are synced in place by _update()
      // (a full rebuild here caused the page to scroll-jump on power-on).
      if (!this._built) this._build(a);
      this._update();
    }

    _build(a) {
      const modes = (a.hvac_modes || []).filter((m) => m !== "off" && ICONS[m]);
      const fans = a.fan_modes || [];
      this._fansKey = JSON.stringify(fans);
      const topts = [...this._c.timer_options];

      this.shadowRoot.innerHTML = `
<style>
  ha-card{background:var(--stc-bg);color:var(--stc-fg);padding:18px;border-radius:var(--ha-card-border-radius,14px);transition:background .6s ease;}
  .hdr{display:flex;align-items:center;gap:12px;}
  .pwr{width:48px;height:48px;border-radius:50%;border:2px solid var(--stc-pwr-border);cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;transition:all .3s;background:var(--stc-pwr-bg);color:var(--stc-pwr-fg);}
  .pwr.on{background:var(--stc-pwr-on-bg);color:var(--stc-pwr-on-fg);border-color:var(--stc-pwr-on-bg);}
  .pwr ha-icon{--mdc-icon-size:26px;}
  .name{font-size:1.15rem;font-weight:500;flex:1;}
  .big{font-size:2.6rem;font-weight:300;line-height:1;}
  .big sup{font-size:1rem;font-weight:400;opacity:.7;}
  .setrow{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 4px;background:var(--stc-surface);border-radius:12px;padding:10px 14px;}
  .lbl{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--stc-sub);}
  .stepper{display:flex;align-items:center;gap:14px;}
  .rbtn{width:36px;height:36px;border-radius:50%;border:none;background:var(--stc-btn-bg);color:var(--stc-fg);font-size:1.25rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .rbtn:active{filter:brightness(1.3);}
  .sval{min-width:52px;text-align:center;font-size:1.25rem;font-weight:500;font-variant-numeric:tabular-nums;}
  .cur{font-size:.85rem;color:var(--stc-sub);}
  .modes{margin-top:16px;}
  .seclbl{text-align:center;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--stc-sub);margin-bottom:8px;}
  .btnrow{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
  .mbtn{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;background:var(--stc-btn-bg);color:var(--stc-btn-fg);display:flex;align-items:center;justify-content:center;}
  .mbtn.sel{background:var(--stc-sel-bg);color:var(--stc-sel-fg);box-shadow:0 2px 8px rgba(0,0,0,.25);}
  .mbtn ha-icon{--mdc-icon-size:22px;}
  .bottom{display:flex;gap:10px;margin-top:16px;}
  .dd{flex:1;background:var(--stc-surface);border-radius:12px;padding:10px 12px;}
  .dd .lbl{display:block;margin-bottom:6px;}
  select{width:100%;border:none;border-radius:8px;padding:8px 10px;font-size:.95rem;background:var(--stc-select-bg);color:var(--stc-fg);cursor:pointer;outline:none;appearance:auto;}
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
    <div class="dd" id="timerdd">
      <span class="lbl" id="timerlbl">Timer</span>
      <select id="timersel">
        ${topts
          .map((m) => `<option value="${m}">${fmtDur(m)}</option>`)
          .join("")}
      </select>
    </div>
  </div>
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
        timerdd: $("timerdd"),
        timerlbl: $("timerlbl"),
        timersel: $("timersel"),
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
      // Background always follows the (last) selected mode — off state is
      // shown by the power button only, matching airtouch-card behaviour
      const bgMode = this._selMode || "off";
      const style = this._c.style;
      const th = THEMES[style];
      const userColors = this._c.colors || {};
      const e = this._el;

      const bg =
        style === "default"
          ? userColors[bgMode] ||
            "var(--ha-card-background,var(--card-background-color,#fff))"
          : { ...BG[style], ...userColors }[bgMode] || BG[style].off;
      const vars = {
        "--stc-bg": bg,
        "--stc-fg": th.fg,
        "--stc-sub": th.sub,
        "--stc-surface": th.surface,
        "--stc-btn-bg": th.btnBg,
        "--stc-btn-fg": th.btnFg,
        "--stc-sel-bg": th.selBg,
        "--stc-sel-fg": th.selFg,
        "--stc-select-bg": th.selectBg,
        "--stc-pwr-border": th.pwrBorder,
        "--stc-pwr-bg": th.pwrBg,
        "--stc-pwr-fg": th.pwrFg,
        "--stc-pwr-on-bg": th.pwrOnBg,
        "--stc-pwr-on-fg": th.pwrOnFg,
      };
      for (const k in vars) e.card.style.setProperty(k, vars[k]);
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

      // Sync fan options in place if the device's fan_modes list changed
      const fansKey = JSON.stringify(a.fan_modes || []);
      if (fansKey !== this._fansKey && this.shadowRoot.activeElement !== e.fansel) {
        this._fansKey = fansKey;
        e.fansel.innerHTML = (a.fan_modes || [])
          .map((f) => `<option value="${f}">${fanLabel(f)}</option>`)
          .join("");
      }
      const selFan = on ? a.fan_mode : this._selFan || a.fan_mode;
      if (selFan != null && e.fansel.value !== selFan && this.shadowRoot.activeElement !== e.fansel)
        e.fansel.value = selFan;

      // Timer dropdown only shows while powered on
      e.timerdd.style.visibility = on ? "visible" : "hidden";
      const active = this._timerActive();
      if (!active) {
        e.timerlbl.textContent = "Timer";
        this._ensureTimerOption(this._pending);
        if (this.shadowRoot.activeElement !== e.timersel)
          e.timersel.value = String(this._pending);
      } else {
        this._updateCount();
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
        this._optOffUntil = Date.now() + 5000;
        this._optOnUntil = 0;
        this._svc("climate", "set_hvac_mode", {
          entity_id: this._c.entity,
          hvac_mode: "off",
        });
        this._cancelTimer();
        this._pending = 0;
        this._update();
        return;
      }
      // Power on: apply staged mode + fan, then arm timer at the configured start value.
      // Only send what actually differs — every IR command beeps the AC.
      this._optOnUntil = Date.now() + 5000;
      this._optOffUntil = 0;
      this._pending = this._c.default_minutes;
      this._svc("climate", "set_hvac_mode", {
        entity_id: this._c.entity,
        hvac_mode: this._selMode || "cool",
      });
      const fan = this._selFan;
      const fanDirty = this._fanDirty;
      setTimeout(() => {
        // Fan command only if the user deliberately changed it while off AND
        // it still differs from the device's remembered fan speed — otherwise
        // Sensibo wakes up with the right fan anyway and a command = extra beep
        const cur = this._st()?.attributes || {};
        if (fanDirty && fan && cur.fan_mode !== fan) {
          this._svc("climate", "set_fan_mode", {
            entity_id: this._c.entity,
            fan_mode: fan,
          });
        }
        this._fanDirty = false;
        // enable_timer is a cloud-side schedule, not an IR command — no beep
        if (this._pending > 0)
          setTimeout(() => this._armTimer(this._pending), 600);
      }, 700);
      this._update();
    }

    _pickMode(m) {
      this._selMode = m;
      store(`stc-mode-${this._c.entity}`, m);
      // Only command the device if it's on AND not already in that mode
      if (this._on() && this._st()?.state !== m)
        this._svc("climate", "set_hvac_mode", {
          entity_id: this._c.entity,
          hvac_mode: m,
        });
      this._update();
    }

    _pickFan(f) {
      this._selFan = f;
      if (this._on()) {
        // Only command the device if it's not already on that fan speed
        if (this._st()?.attributes?.fan_mode !== f)
          this._svc("climate", "set_fan_mode", {
            entity_id: this._c.entity,
            fan_mode: f,
          });
      } else {
        this._fanDirty = true; // apply at power-on
      }
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
            style: "Style",
            default_minutes: "Timer start value at power-on (minutes, 0 = off)",
            interval_minutes: "Timer dropdown interval (minutes)",
            max_minutes: "Timer dropdown maximum (minutes)",
          }[s.name] || s.name);
        this._form.schema = [
          {
            name: "entity",
            required: true,
            selector: { entity: { domain: "climate" } },
          },
          { name: "name", selector: { text: {} } },
          {
            name: "style",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "default", label: "Default (follows theme)" },
                  { value: "bold", label: "Bold" },
                  { value: "pastel", label: "Pastel" },
                ],
              },
            },
          },
          {
            name: "default_minutes",
            selector: { number: { min: 0, step: 5, mode: "box" } },
          },
          {
            name: "interval_minutes",
            selector: { number: { min: 5, max: 60, step: 5, mode: "box" } },
          },
          {
            name: "max_minutes",
            selector: { number: { min: 30, step: 30, mode: "box" } },
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
        interval_minutes: 10,
        max_minutes: 240,
        style: "pastel",
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
      "Thermostat-style Sensibo card with power button, mode buttons, fan/timer dropdowns and pastel mode-coloured background.",
    preview: true,
  });
})();
