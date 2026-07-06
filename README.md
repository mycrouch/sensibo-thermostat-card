# Sensibo Thermostat Card

A thermostat-style Lovelace card for [Sensibo](https://www.home-assistant.io/integrations/sensibo/) AC controllers, with mode-coloured backgrounds and built-in support for Sensibo's native off-timer.

The standard thermostat card doesn't surface Sensibo's timer, and gives no at-a-glance indication of the running mode. This card fixes both.

## Features

- **Dedicated power button** — on/off lives on its own button, separate from mode selection. Set the mode and fan speed at any time (staged while the unit is off), then hit power.
- **Mode buttons + fan/timer dropdowns** — a round-button row for every HVAC mode (heat/cool shown as **Auto**), and fan speed + timer as side-by-side dropdowns at the bottom of the card. Selections apply live while running, or are staged and applied at power-on while off.
- **Thermostat-style layout** — target temperature with +/− (respects the device's min/max and step), plus current temperature and humidity.
- **Three styles, GUI-selectable** — like [airtouch-card](https://github.com/mycrouch/airtouch-card): `default` (no gradient, follows your HA theme), `bold` (dark mode-tinted gradients, white text) or `pastel` (soft mode-tinted gradients, dark text). Gradient colours change with the running mode — heat, cool, dry, fan-only, auto, off — with a smooth transition, and are overridable per mode.
- **Native off-timer with live countdown** — the timer dropdown appears only while the unit is running. At power-on the Sensibo off-timer is armed (`sensibo.enable_timer`) at the configured start value and a live countdown is shown. Change the dropdown mid-run to re-arm at the new duration, or pick Off to cancel (the AC keeps running). Because the timer runs on the Sensibo device itself, the shutdown happens even if Home Assistant is restarting.
- **Manual off resets the timer** — powering off cancels the timer and resets the duration to Off.
- **No scroll-jumping** — the card updates its DOM in place rather than re-rendering, so interacting with it never bounces the dashboard back to the top.
- **Full GUI configuration** — appears in the card picker with a visual editor. Timer entities are derived automatically from the climate entity, so minimal config is a single line.

## Requirements

- The official [Sensibo integration](https://www.home-assistant.io/integrations/sensibo/) (provides the `climate.*` entity plus the `switch.*_timer` and `sensor.*_timer_end_time` entities this card uses).

## Installation

### HACS (recommended)

1. HACS → three-dot menu → **Custom repositories**
2. Add this repository's URL, category **Dashboard**
3. Search for **Sensibo Thermostat Card** and download it
4. Reload your browser (HACS registers the resource automatically)

### Manual

1. Copy `sensibo-thermostat-card.js` to `/config/www/`
2. Add a dashboard resource: URL `/local/sensibo-thermostat-card.js`, type **JavaScript module**

## Configuration

Add via the dashboard UI (**Add card → Sensibo Thermostat Card**) or in YAML:

```yaml
type: custom:sensibo-thermostat-card
entity: climate.dining_room_sensibo_living_area
name: Living Area          # optional, defaults to the entity's friendly name
default_minutes: 60        # optional, initial timer duration (0 = timer off)
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity` | yes | — | Sensibo `climate` entity |
| `name` | no | friendly name | Card title |
| `style` | no | `pastel` | `default` (follows theme), `bold`, or `pastel` (`light` accepted as an alias) |
| `default_minutes` | no | `60` | Timer value armed at power-on, in minutes; `0` = no timer |
| `interval_minutes` | no | `10` | Timer dropdown interval |
| `max_minutes` | no | `240` | Timer dropdown maximum |
| `timer_options` | no | generated | Explicit list of minute values (overrides interval/max) |
| `timer_switch` | no | derived | Override the `switch.*_timer` entity |
| `timer_end` | no | derived | Override the `sensor.*_timer_end_time` entity |
| `colors` | no | built-in | Per-mode CSS background overrides, e.g. `heat: "linear-gradient(145deg,#fdd,#fba)"` |

### Timer behaviour

The timer dropdown is hidden while the unit is off. Powering on from the card arms the timer at `default_minutes` (set it to `0` for no automatic timer). While running, the label shows a live countdown; changing the dropdown re-arms the device timer at the new duration, and selecting Off cancels the timer without stopping the AC. Powering off manually cancels the timer. Powering on from the Sensibo app or an IR remote does not arm the timer — if you want that, pair the card with a small automation that calls `sensibo.enable_timer` when the climate entity leaves `off`.

## License

MIT
