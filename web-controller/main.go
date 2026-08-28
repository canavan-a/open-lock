package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"open-lock/web-controller/internal/config"
	"open-lock/web-controller/internal/door"
	"open-lock/web-controller/internal/httpapi"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg := config.FromEnv()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	lk, err := door.New(cfg, log)
	if err != nil {
		return err
	}
	defer lk.Stop()
	go lk.Poll(ctx)

	uiFS, err := fs.Sub(uiDist, "ui/dist")
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: httpapi.New(lk, uiFS, log),
	}

	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
