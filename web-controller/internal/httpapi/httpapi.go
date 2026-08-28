// Package httpapi builds the Gin router: the lock JSON endpoints plus the
// embedded single-page UI. Authentication is intentionally absent — it is
// handled at the edge (Cloudflare Access).
package httpapi

import (
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"open-lock/web-controller/internal/door"
)

// Locker is the subset of *door.Door the HTTP layer needs.
type Locker interface {
	Open()
	Close()
	State() door.State
	Battery() int
}

// New returns a router serving the lock API and the UI from uiFS (already
// rooted at the directory that contains index.html).
func New(lk Locker, uiFS fs.FS, log *slog.Logger) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(requestLogger(log), gin.Recovery())

	corsCfg := cors.DefaultConfig()
	corsCfg.AllowAllOrigins = true
	corsCfg.AllowMethods = []string{"GET", "POST", "OPTIONS"}
	r.Use(cors.New(corsCfg))

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/state", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"state": lk.State().String()})
	})
	r.GET("/battery", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"battery": lk.Battery()})
	})
	r.POST("/open", func(c *gin.Context) {
		lk.Open()
		c.JSON(http.StatusAccepted, gin.H{"sent": "open"})
	})
	r.POST("/close", func(c *gin.Context) {
		lk.Close()
		c.JSON(http.StatusAccepted, gin.H{"sent": "closed"})
	})

	fileServer := http.FileServer(http.FS(uiFS))
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method != http.MethodGet {
			c.Status(http.StatusNotFound)
			return
		}
		if _, err := fs.Stat(uiFS, trimLeadingSlash(c.Request.URL.Path)); err != nil {
			// Unknown path: hand the SPA its entry point.
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})

	return r
}

func trimLeadingSlash(p string) string {
	if p == "" || p == "/" {
		return "index.html"
	}
	return p[1:]
}

func requestLogger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Debug("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"dur", time.Since(start),
		)
	}
}
