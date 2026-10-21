{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShellNoCC {
  packages =  with pkgs; [
    ncurses
    git
    bun
    just
    # nodejs_24
    curl
    jq
    ripgrep
    coreutils
  ];
}
