#!/usr/bin/env bash
set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
START_DIR="$PWD"

# Debug paths if needed
# echo "SCRIPT_DIR: $SCRIPT_DIR"
# echo "ROOT_DIR: $ROOT_DIR"
# echo "START_DIR: $START_DIR"

# Ensure all operations run under Infisical
if ! command -v infisical >/dev/null 2>&1; then
  echo "${RED}Error: 'infisical' CLI not found in PATH. Please install infisical first:${NC}" >&2
  echo "    brew install infisical" >&2
  exit 1
fi

# Set up infisical command
INFISICAL_PREFIX="infisical run --"

# Colors for status output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -i ":$port" > /dev/null 2>&1; then
        return 0 # Port is in use
    else
        return 1 # Port is free
    fi
}

# Function to check if a process is running
is_process_running() {
    local name=$1
    pgrep -f "$name" >/dev/null
}

# Function to wait for a service to be ready
wait_for_service() {
    local name=$1
    local port=$2
    local max_attempts=60
    local attempt=1

    echo "Waiting for $name to be ready..."
    while ! curl -sf "http://localhost:$port/healthz" >/dev/null 2>&1 && ! curl -sf "http://localhost:$port" >/dev/null 2>&1; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e "${RED}Failed to start $name after $max_attempts attempts${NC}"
            return 1
        fi
        sleep 1
        ((attempt++))
    done
    echo -e "${GREEN}$name is ready!${NC}"
}

# Function to display service status
show_status() {
    echo -e "\n${BOLD}Codebuff Services Status:${NC}"

    # Check backend
    if is_process_running "backend.*dev" && check_port 4242; then
        echo -e "Backend (4242): ${GREEN}Running${NC}"
    else
        echo -e "Backend (4242): ${RED}Not running${NC}"
    fi

    # Check web
    if is_process_running "web.*dev" && check_port 3000; then
        echo -e "Web (3000):     ${GREEN}Running${NC}"
    else
        echo -e "Web (3000):     ${RED}Not running${NC}"
    fi

    # Check database (stack name uses 'manicode' in this repo)
    if docker ps --format '{{.Names}}' | grep -q "^manicode-db-1$"; then
        echo -e "Database:       ${GREEN}Running${NC}"
    else
        echo -e "Database:       ${RED}Not running${NC}"
    fi
}

# Function to ensure .agents symlink
setup_agents_symlink() {
    local target_dir="${1:-$START_DIR}"
    local AGENTS_SRC="$ROOT_DIR/.agents"
    local AGENTS_DST="$target_dir/.agents"

    if [ -d "$AGENTS_SRC" ]; then
        # Recreate broken symlink
        if [ -L "$AGENTS_DST" ] && [ ! -e "$AGENTS_DST" ]; then
            rm -f "$AGENTS_DST" || true
        fi
        # Create symlink if missing
        if [ ! -e "$AGENTS_DST" ]; then
            ln -s "$AGENTS_SRC" "$AGENTS_DST" 2>/dev/null || true
        fi
    fi
}

# Function to stop services
stop_services() {
    echo -e "${YELLOW}Stopping Codebuff services...${NC}"
    pkill -f "backend.*dev" 2>/dev/null || true
    pkill -f "web.*dev" 2>/dev/null || true

    # Stop database if it exists
    if [ -f "$ROOT_DIR/common/src/db/docker-compose.yml" ]; then
        (cd "$ROOT_DIR/common/src/db" && docker compose down) 2>/dev/null || true
    fi

    # Remove log files
    rm -f backend.log web.log 2>/dev/null || true

    echo -e "${GREEN}All services stopped${NC}"
}

# Function to start a specific service
start_service() {
    local service=$1
    local port=$2
    local command=$3
    local return_dir="$PWD"

    if ! check_port "$port"; then
        echo -e "${YELLOW}Starting $service...${NC}"
        local log_file="backend.log"
        if [ "$service" = "Web" ]; then
            log_file="web.log"
        fi
        cd "$ROOT_DIR" && DISABLE_GOOGLE_CLOUD=true $INFISICAL_PREFIX $command >> "$ROOT_DIR/$log_file" 2>&1 &
        cd "$return_dir"
        sleep 2 # Give it a moment to start
        wait_for_service "$service" "$port"
    else
        echo -e "${YELLOW}$service is already running on port $port${NC}"
    fi
}

# Help text
show_help() {
    echo -e "${BOLD}Usage:${NC} $(basename "$0") [command]"
    echo
    echo "Commands:"
    echo "  start-bin Start Codebuff binary in current directory (default)"
    echo "  start    Start Codebuff services (db, backend, web)"
    echo "  stop     Stop all Codebuff services"
    echo "  restart  Restart all Codebuff services"
    echo "  status   Show status of all services"
    echo "  install  Install global 'codebuff' command"
    echo "  help     Show this help message"
    echo
    echo "Examples:"
    echo "  cb                             Start Codebuff in current directory"
    echo "  cb --cwd /path/to/project      Start Codebuff in specific directory"
    echo "  cb --infisical-project /path   Use specific infisical project path"
    echo "  cb status                      Show services status"
    echo "  cb stop                        Stop all services"
    echo
    echo "Usage from any directory:"
    echo "  cd /your/project/path && cb    # Start in current directory"
    echo "  cb --cwd /other/path           # Start in specific directory"
}

# Function to validate directory
validate_directory() {
    local target_dir="${1:-$PWD}"
    # Check if the target directory is a git repository
    if ! (cd "$target_dir" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
        echo -e "${RED}Error: $target_dir is not in a git repository${NC}"
        exit 1
    fi
}

# Function to ensure all services are running
ensure_services() {
    local services_started=false

        # Start database if not running
    if ! docker ps --format '{{.Names}}' | grep -q "^manicode-db-1$"; then
        echo -e "${YELLOW}Starting database...${NC}"
        (cd "$ROOT_DIR/common" && docker compose -f ./src/db/docker-compose.yml up --wait >> "$ROOT_DIR/db.log" 2>&1 && bun run db:generate >> "$ROOT_DIR/db.log" 2>&1 && sleep 1 && bun run db:migrate >> "$ROOT_DIR/db.log" 2>&1) &

        # Wait for database to be ready
        echo "Waiting for database container to start..."
        sleep 12

        # Create user and add credits for rewalu@gmail.com
        echo -e "${YELLOW}Setting up user and credits...${NC}"
        docker exec -i manicode-db-1 psql -U manicode_user_local -d manicode_db_local << EOF
        -- Get existing user id or create new one
        WITH get_user AS (
            SELECT id FROM "user" WHERE email = 'rewalu@gmail.com'
        ), new_user AS (
            INSERT INTO "user" (id, email, name, created_at)
            SELECT
                '549ea6bf-df5d-4bc6-ae0c-9e3e8ca7b8bc',
                'rewalu@gmail.com',
                'Renato Wasescha',
                now()
            WHERE NOT EXISTS (SELECT 1 FROM get_user)
            RETURNING id
        )
        -- Add credits using the user id
        INSERT INTO credit_ledger (operation_id, user_id, principal, balance, type, priority, created_at)
        SELECT
            md5(random()::text),
            COALESCE((SELECT id FROM get_user), (SELECT id FROM new_user)),
            999999999,
            999999999,
            'admin'::grant_type,
            1,
            now()
        WHERE NOT EXISTS (
            SELECT 1 FROM credit_ledger
            WHERE user_id = '549ea6bf-df5d-4bc6-ae0c-9e3e8ca7b8bc'
            AND balance > 0
        );
EOF
        services_started=true
    fi

    # Start backend if not running
    if ! check_port 4242; then
        start_service "Backend" 4242 "bun run start-server"
        services_started=true
    fi

    # Start web if not running
    if ! check_port 3000; then
        start_service "Web" 3000 "bun run start-web"
        services_started=true
    fi

    if [ "$services_started" = true ]; then
        echo -e "${GREEN}All required services are now running${NC}"
    else
        echo -e "${GREEN}All required services were already running${NC}"
    fi
}

# Function to install global symlink
install_global_symlink() {
    local install_path="/usr/local/bin/codebuff"
    local source_path="$ROOT_DIR/npm-app/bin/codebuff"

    echo -e "${YELLOW}Installing global 'codebuff' command...${NC}"

    if [ ! -f "$source_path" ]; then
        echo -e "${RED}Error: Codebuff binary not found at $source_path${NC}"
        exit 1
    fi

    if [ -f "$install_path" ] && [ ! -L "$install_path" ]; then
        echo -e "${RED}Error: A non-symlink file already exists at $install_path. Please remove it manually.${NC}"
        exit 1
    fi

    sudo rm -f "$install_path" 2>/dev/null || true
    sudo ln -s "$source_path" "$install_path"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Global 'codebuff' command installed to $install_path${NC}"
        echo -e "${GREEN}You can now run 'codebuff' from any directory.${NC}"
    else
        echo -e "${RED}Failed to install global 'codebuff' command. Check permissions.${NC}"
        exit 1
    fi
}

# Function to parse --infisical-project argument
parse_infisical_project() {
    local args=( "$@" )
    local project_path="$INFISICAL_PROJECT_PATH"

    for ((i=0; i<${#args[@]}; i++)); do
        if [[ "${args[i]}" == "--infisical-project" ]] && [[ -n "${args[i+1]}" ]]; then
            project_path="${args[i+1]}"
            break
        fi
    done
    echo "$project_path"
}

# Function to parse --cwd argument
parse_cwd() {
    local args=( "$@" )
    local cwd="$PWD"

    for ((i=0; i<${#args[@]}; i++)); do
        if [[ "${args[i]}" == "--cwd" ]] && [[ -n "${args[i+1]}" ]]; then
            cwd="${args[i+1]}"
            break
        fi
    done
    echo "$cwd"
}

# Main logic
main() {
    local cwd=$(parse_cwd "$@")

    if [ $# -eq 0 ]; then
        # Wenn keine Argumente, starte start-bin im codebuff-fork Verzeichnis mit cwd
        cd "$ROOT_DIR" && DISABLE_GOOGLE_CLOUD=true infisical run -- bun --cwd "$ROOT_DIR/npm-app" start-bin -- --cwd "$cwd"
        exit 0
    fi

    local command=$1

    case $command in
        start-bin)
            validate_directory "$cwd"
            setup_agents_symlink "$cwd"
            ensure_services
            show_status
            echo -e "\n${YELLOW}Starting Codebuff in $(basename "$cwd")...${NC}"
            cd "$ROOT_DIR" && DISABLE_GOOGLE_CLOUD=true infisical run -- bun --cwd "$ROOT_DIR/npm-app" start-bin -- --cwd "$cwd"
            ;;
        start)
            setup_agents_symlink
            ensure_services
            show_status
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            sleep 2
            main start
            ;;
        status)
            show_status
            ;;
        help)
            show_help
            ;;
        install)
            install_global_symlink
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            show_help
            exit 1
            ;;
    esac
}

main "${1:-start}"
