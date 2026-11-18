package xdrl002_test

import (
	"testing"

	"github.com/JoseCToscano/xdr-cap-coverage-kit/linter/xdrl002"
	"golang.org/x/tools/go/analysis/analysistest"
)

// Seeded: every `// want` must be reported. Clean: nothing may be reported.
func TestSeeded(t *testing.T) { analysistest.Run(t, analysistest.TestData(), xdrl002.Analyzer, "seeded") }
func TestClean(t *testing.T)  { analysistest.Run(t, analysistest.TestData(), xdrl002.Analyzer, "clean") }
