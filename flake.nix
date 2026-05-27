{
  description = "open-lock: ESP32 smart lock web controller";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          # Stage 1: build the React/Vite UI.
          # After running `nix build .#ui` the first time, replace the placeholder
          # with the hash from the error: "got: sha256-<hash>"
          ui = pkgs.buildNpmPackage {
            pname = "open-lock-ui";
            version = "0.1.0";
            src = ./web-controller/ui;
            npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };

          # Stage 2: build the Go binary with the UI embedded.
          # Replace vendorHash similarly after the first failed build.
          web-controller = pkgs.buildGoModule {
            pname = "web-controller";
            version = "0.1.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./web-controller;
              filter = path: type:
                let name = builtins.baseNameOf (toString path); in
                name != "vendor" && name != "bin" && name != "node_modules";
            };
            vendorHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
            preBuild = ''
              rm -rf ui/dist
              cp -r ${ui} ui/dist
            '';
          };

        in {
          inherit ui web-controller;
          default = web-controller;
        }
      );

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.openLock;
          webController = self.packages.${pkgs.system}.web-controller;
        in {
          options.services.openLock = {
            enable = lib.mkEnableOption "open-lock web controller and MQTT broker";

            httpAddr = lib.mkOption {
              type = lib.types.str;
              default = ":8080";
              description = "HTTP listen address.";
            };

            mqttPort = lib.mkOption {
              type = lib.types.port;
              default = 1883;
              description = "Port mosquitto listens on (and the web-controller connects to).";
            };

            environmentFile = lib.mkOption {
              type = lib.types.nullOr lib.types.path;
              default = null;
              description = ''
                Optional path to an environment file.
                Useful for MQTT_USERNAME / MQTT_PASSWORD when MQTT_ANON=false.
                See config.example.env for all supported variables.
              '';
            };
          };

          config = lib.mkIf cfg.enable {
            services.mosquitto = {
              enable = true;
              listeners = [{
                address = "127.0.0.1";
                port = cfg.mqttPort;
                settings.allow_anonymous = true;
                acl = [ "topic readwrite #" ];
              }];
            };

            systemd.services.open-lock = {
              description = "open-lock web controller";
              wantedBy = [ "multi-user.target" ];
              after = [ "mosquitto.service" "network.target" ];
              requires = [ "mosquitto.service" ];

              environment = {
                MQTT_BROKER = "127.0.0.1";
                MQTT_PORT = toString cfg.mqttPort;
                HTTP_ADDR = cfg.httpAddr;
              };

              serviceConfig = {
                ExecStart = "${webController}/bin/web-controller";
                Restart = "on-failure";
                DynamicUser = true;
              } // lib.optionalAttrs (cfg.environmentFile != null) {
                EnvironmentFile = cfg.environmentFile;
              };
            };
          };
        };

      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in {
          default = pkgs.mkShell {
            packages = [ pkgs.go pkgs.nodejs pkgs.mosquitto ];
          };
        }
      );
    };
}
