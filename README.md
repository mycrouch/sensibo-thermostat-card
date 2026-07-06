# Sensibo Thermostat Card

A thermostat-style Lovelace card for [Sensibo](https://www.home-assistant.io/integrations/sensibo/) AC controllers, with mode-coloured backgrounds and built-in support for Sensibo's native off-timer.

The standard thermostat card doesn't surface Sensibo's timer, and gives no at-a-glance indication of the running mode. This card fixes both.

## Features

- **Thermostat-style layout** — current temperature and humidity, large target temperature with +/− controls (respects the device's min/max and step), and a button row for every HVAC mode the device supports.
- **Mode-coloured background** — the whole card changes colour with the running mode, with a smooth transition: heat orange, cool blue, dry amber, fan-only teal, heat/cool green, off dark grey. Colours are overridable per mode.
- **Native off-timer with live countdown** — set a duration with the +/− stepper, and when the AC is turned on from the card the Sensibo off-timer is armed (`sensibo.enable_timer`) and a live countdown is shown with a cancel button. Because the timer runs on the Sensibo device itself, the shutdown happens even if Home Assistant is restarting.
- **Off resets everything** — selecting the off mode turns the device off, cancels the timer, and resets the duration to zero.
- **Adjust on the fly** — changing the stepper while the AC is running re-arms the timer at the new duration (debounced).
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
step_minutes: 30           # optional, stepper increment
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity` | yes | — | Sensibo `climate` entity |
| `name` | no | friendly name | Card title |
| `default_minutes` | no | `60` | Initial timer duration in minutes; `0` disables |
| `step_minutes` | no | `30` | Stepper increment in minutes |
| `timer_switch` | no | derived | Override the `switch.*_timer` entity |
| `timer_end` | no | derived | Override the `sensor.*_timer_end_time` entity |
| `colors` | no | built-in | Per-mode CSS background overrides, e.g. `heat: "linear-gradient(145deg,#900,#f60)"` |

### Timer behaviour

The timer arms **when the AC is turned on from the card** (or when the stepper is adjusted while running). Turning the AC on from the Sensibo app or an IR remote does not arm the timer — if you want that, pair the card with a small automation that calls `sensibo.enable_timer` when the climate entity leaves `off`.

## License

MIT
