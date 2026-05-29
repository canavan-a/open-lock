# Open Lock

IoT door lock with open source firmware, 3d models, and web controller

firmware

models

web-controller

## Hardware

| Part | Notes | Link |
|------|-------|------|
| Servo — MG995 Metal Gear | Main actuator for the lock | [Amazon](https://www.amazon.com/Deegoo-FPV-Servo-MG995-Metal-Gear/dp/B07NQJ1VZ2) |
| Battery pack | Power supply | [Amazon](https://www.amazon.com/dp/B0DZX39MHK) |
| ESP32 dev board | Microcontroller | — |
| M3 screws | Structural fasteners | — |
| M2 tapered screws | PCB/servo mount fasteners | — |

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

