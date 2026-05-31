# Open Lock

IoT door lock with open source firmware, 3d models, and web controller

[firmware](firmware/README.md) — ESP32 firmware

[models](models/readme.md) — 3D printable parts

[web-controller](web-controller/readme.md) — Go + React web UI

## Hardware

| Part | Notes | Link |
|------|-------|------|
| Servo — MG995 Metal Gear | Main actuator for the lock | [Amazon](https://www.amazon.com/Deegoo-FPV-Servo-MG995-Metal-Gear/dp/B07NQJ1VZ2) |
| Battery pack | Power supply | [Amazon](https://www.amazon.com/dp/B0DZX39MHK) |
| ESP32 WROOM-32U  | Microcontroller | [Amazon](https://www.amazon.com/D-FLIFE-ESP32-DevKitC-Development-ESP32-WROOM-32U-Bluetooth/dp/B089F6LRBS/ref=sr_1_1) |
| M3 screws | Structural fasteners | — |
| M2 tapered screws | PCB/servo mount fasteners | — |
| INA219 module | detects high servo current | — |
| XL63020 module | Buck Boost module (for esp battry input) | [Amazon](https://www.amazon.com/dp/B0D8T3J8QZ) |
| wlaniot PCI antenna | U.FL internal antenna module | [Amazon](https://www.amazon.com/dp/B077SVP7PN) |


## Firmware

See [firmware/README.md](firmware/README.md) for setup, configuration, and flashing instructions.


## Nix

### NixOS module (recommended)

Add the flake input and import the module in your `flake.nix`:

```nix
inputs.open-lock.url = "github:canavan-a/open-lock";

outputs = { nixpkgs, open-lock, ... }: {
  nixosConfigurations.mymachine = nixpkgs.lib.nixosSystem {
    system = "x86_64-linux";
    modules = [
      open-lock.nixosModules.default
      {
        services."open-lock" = {
          enable       = true;
          httpAddr     = ":8080";
          mqttPort     = 1883;
          pollInterval = "2s";
        };
      }
    ];
  };
};
```

This starts the web controller as a systemd service and manages a local mosquitto broker automatically.

### Local development

Reference the local path instead of GitHub:

```nix
inputs.open-lock.url = "path:/path/to/open-lock";
```

### Build the binary

```bash
nix build github:canavan-a/open-lock#web-controller
./result/bin/web-controller
```

### Dev shell

```bash
nix develop github:canavan-a/open-lock
# provides: go, nodejs, mosquitto
```

