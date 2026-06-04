{ pkgs ? import <nixpkgs> {} }:

pkgs.buildGoModule {
  pname = "web-controller";
  version = "0.1.0";
  src = ./web-controller;
  vendorHash = null;
}
