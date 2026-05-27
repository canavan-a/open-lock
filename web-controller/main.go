package main

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"open-lock/web-controller/config"
	"open-lock/web-controller/lock"
)

func main() {
	cfg := config.FromEnv()

	lc, err := lock.New(cfg)
	if err != nil {
		log.Fatalf("mqtt: %v", err)
	}
	defer lc.Stop()
	lc.StartPolling()

	mux := http.NewServeMux()

	mux.HandleFunc("POST /open", func(w http.ResponseWriter, r *http.Request) {
		lc.Open()
		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("POST /close", func(w http.ResponseWriter, r *http.Request) {
		lc.Close()
		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("GET /state", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"state": lc.State().String()})
	})

	uiFS, err := fs.Sub(uiDist, "ui/dist")
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/", http.FileServer(http.FS(uiFS)))

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: mux}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		srv.Close()
	}()

	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
