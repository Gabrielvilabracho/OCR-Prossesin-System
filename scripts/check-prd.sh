#!/bin/sh
# Validate structural completeness of a PRD Lite or Full document.
# Usage:
#   ./scripts/check-prd.sh <path-to-prd.md> [--type lite|full]
#
# If --type is omitted, it is auto-detected from the H1 heading:
#   "PRD Lite" → lite
#   "PRD Full" → full
#
# Exit codes:
#   0  All required sections present
#   1  One or more sections missing or file not found
#   2  Usage error

set -eu

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
    printf "Usage: %s <path-to-prd.md> [--type lite|full]\n" "$0" >&2
    exit 2
}

contains_heading() {
    # Returns 0 if the file contains a markdown heading with the given text.
    # Matches "## N) Title" or "## Title" (case-insensitive via tr).
    file="$1"
    heading="$2"
    # Normalise to lowercase for comparison
    pattern=$(printf "%s" "$heading" | tr '[:upper:]' '[:lower:]')
    while IFS= read -r line; do
        normalised=$(printf "%s" "$line" | tr '[:upper:]' '[:lower:]')
        case "$normalised" in
            *"$pattern"*) return 0 ;;
        esac
    done < "$file"
    return 1
}

check_section() {
    file="$1"
    label="$2"
    heading="$3"
    if contains_heading "$file" "$heading"; then
        printf "  [OK]  %s\n" "$label"
        return 0
    else
        printf "  [MISSING]  %s  (expected heading containing: \"%s\")\n" "$label" "$heading" >&2
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

[ "$#" -lt 1 ] && usage

PRD_FILE="$1"
PRD_TYPE=""

shift
while [ "$#" -gt 0 ]; do
    case "$1" in
        --type)
            [ "$#" -lt 2 ] && usage
            PRD_TYPE="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done

if [ ! -f "$PRD_FILE" ]; then
    printf "File not found: %s\n" "$PRD_FILE" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Auto-detect type if not provided
# ---------------------------------------------------------------------------

if [ -z "$PRD_TYPE" ]; then
    first_heading=$(awk '/^# / { print; exit }' "$PRD_FILE" | tr '[:upper:]' '[:lower:]')
    case "$first_heading" in
        *"lite"*) PRD_TYPE="lite" ;;
        *"full"*) PRD_TYPE="full" ;;
        *)
            printf "Cannot auto-detect PRD type from H1 heading.\n" >&2
            printf "Pass --type lite or --type full explicitly.\n" >&2
            exit 2
            ;;
    esac
fi

case "$PRD_TYPE" in
    lite|full) ;;
    *)
        printf "Invalid type: %s. Use lite or full.\n" "$PRD_TYPE" >&2
        exit 2
        ;;
esac

# ---------------------------------------------------------------------------
# Section definitions
# ---------------------------------------------------------------------------

# Sections required in BOTH types
check_common() {
    file="$1"
    FAIL=0
    check_section "$file" "Problema de negocio / AS-IS"  "problema"        || FAIL=1
    check_section "$file" "KPI / Objetivos"              "kpi"              || FAIL=1
    check_section "$file" "Alcance IN/OUT"               "alcance"          || FAIL=1
    check_section "$file" "Riesgos y supuestos"          "riesgo"           || FAIL=1
    check_section "$file" "Plan de validacion"           "validaci"         || FAIL=1
    check_section "$file" "Go-live / Rollback"           "rollback"         || FAIL=1
    check_section "$file" "Fases F0-F6"                  "fase"             || FAIL=1
    check_section "$file" "Aprobaciones"                 "aprobacion"       || FAIL=1
    return "$FAIL"
}

# Extra sections required only in FULL
check_full_extras() {
    file="$1"
    FAIL=0
    check_section "$file" "Resumen Ejecutivo"            "resumen ejecutivo"         || FAIL=1
    check_section "$file" "Actores / Casos de uso"       "actores"                   || FAIL=1
    check_section "$file" "Flujo TO-BE"                  "flujo"                     || FAIL=1
    check_section "$file" "Requisitos Funcionales"       "requisitos funcionales"    || FAIL=1
    check_section "$file" "Requisitos No Funcionales"    "no funcionales"            || FAIL=1
    check_section "$file" "Datos e Integraciones"        "integraciones"             || FAIL=1
    check_section "$file" "Plan de QA"                   "qa"                        || FAIL=1
    check_section "$file" "Handoff / Soporte"            "handoff"                   || FAIL=1
    check_section "$file" "Historial de cambios"         "historial"                 || FAIL=1
    return "$FAIL"
}

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------

printf "\n--- PRD Validator ---\n"
printf "File: %s\n" "$PRD_FILE"
printf "Type: %s\n\n" "$PRD_TYPE"

RESULT=0

printf "Common sections:\n"
check_common "$PRD_FILE" || RESULT=1

if [ "$PRD_TYPE" = "full" ]; then
    printf "\nFull-only sections:\n"
    check_full_extras "$PRD_FILE" || RESULT=1
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

printf "\n--- Result ---\n"
if [ "$RESULT" -eq 0 ]; then
    printf "PASS — all required sections present.\n"
else
    printf "FAIL — one or more required sections are missing.\n" >&2
    printf "Fix the document and re-run this script.\n" >&2
fi

exit "$RESULT"
