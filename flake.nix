{
  description = "open-lock web controller";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in {
          web-controller = pkgs.buildGoModule {
            pname = "web-controller";
            version = "0.1.0";
            src = ./web-controller;
            vendorHash = null;
          };
          default = self.packages.${system}.web-controller;
        }
      );

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services."open-lock";
          webController = self.packages.${pkgs.system}.web-controller;
        in {
          options.services."open-lock" = {
            enable = lib.mkEnableOption "open-lock web controller and MQTT broker";

            httpAddr = lib.mkOption {
              type = lib.types.str;
              default = ":8080";
              description = "HTTP listen address.";
            };

            mqttPort = lib.mkOption {
              type = lib.types.port;
              default = 1883;
              description = "Port mosquitto listens on.";
            };

            mqttBroker = lib.mkOption {
              type = lib.types.str;
              default = "127.0.0.1";
              description = "MQTT broker hostname or IP.";
            };

            mqttAnon = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Allow anonymous MQTT connections. Set to false and use environmentFile for credentials.";
            };

            mqttClientId = lib.mkOption {
              type = lib.types.str;
              default = "web-controller";
              description = "MQTT client ID.";
            };

            topicSignal = lib.mkOption {
              type = lib.types.str;
              default = "open-lock-signal";
              description = "MQTT topic for lock signal commands.";
            };

            topicState = lib.mkOption {
              type = lib.types.str;
              default = "open-lock-state";
              description = "MQTT topic for lock state updates.";
            };

            pollInterval = lib.mkOption {
              type = lib.types.str;
              default = "2s";
              description = "How often to poll lock state (e.g. \"2s\", \"500ms\").";
            };

            mqttUsername = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "MQTT username. Only used when mqttAnon is false.";
            };

            mqttPassword = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "MQTT password. Consider using environmentFile for secrets instead.";
            };

            environmentFile = lib.mkOption {
              type = lib.types.nullOr lib.types.path;
              default = null;
              description = "Optional environment file for MQTT credentials. See config.example.env.";
            };

            manageBroker = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Whether to configure and start a local mosquitto broker. Set to false if you have an existing broker.";
            };
          };

          config = lib.mkIf cfg.enable {
            services.mosquitto = lib.mkIf cfg.manageBroker {
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
              requires = lib.optional cfg.manageBroker "mosquitto.service";

              environment = {
                MQTT_BROKER = cfg.mqttBroker;
                MQTT_PORT = toString cfg.mqttPort;
                MQTT_ANON = if cfg.mqttAnon then "true" else "false";
                MQTT_CLIENT_ID = cfg.mqttClientId;
                TOPIC_SIGNAL = cfg.topicSignal;
                TOPIC_STATE = cfg.topicState;
                POLL_INTERVAL = cfg.pollInterval;
                HTTP_ADDR = cfg.httpAddr;
              } // lib.optionalAttrs (cfg.mqttUsername != null) {
                MQTT_USERNAME = cfg.mqttUsername;
              } // lib.optionalAttrs (cfg.mqttPassword != null) {
                MQTT_PASSWORD = cfg.mqttPassword;
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
