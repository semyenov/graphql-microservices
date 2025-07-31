#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY=${REGISTRY:-""}
VERSION=${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "latest")}
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Enable BuildKit
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if we should use buildx
USE_BUILDX=false
if docker buildx version >/dev/null 2>&1; then
    USE_BUILDX=true
    print_info "Using Docker Buildx for enhanced build features"
    # Create builder instance if it doesn't exist
    if ! docker buildx inspect mybuilder >/dev/null 2>&1; then
        docker buildx create --name mybuilder --use
    else
        docker buildx use mybuilder
    fi
fi

# Auto-discover services
SERVICES=($(ls -d services/*/ | xargs -n1 basename))

# Build function
build_service() {
    local service=$1
    local image_name="${REGISTRY}graphql-microservices-${service}"

    print_step "Building ${service} service..."

    # Build arguments
    BUILD_ARGS=(
        --build-arg BUILD_DATE="${BUILD_DATE}"
        --build-arg VCS_REF="${VCS_REF}"
        --build-arg VERSION="${VERSION}"
    )

    # Build with cache
    if [ -n "${REGISTRY}" ]; then
        BUILD_ARGS+=(--cache-from "${image_name}:latest")
        BUILD_ARGS+=(--cache-from "${REGISTRY}graphql-microservices-builder:latest")
    fi

    # Add progress output
    BUILD_ARGS+=(--progress=plain)

    # Build the image
    if docker build \
        -f "services/${service}/Dockerfile" \
        -t "${image_name}:${VERSION}" \
        -t "${image_name}:latest" \
        "${BUILD_ARGS[@]}" \
        .; then
        print_info "Successfully built ${service} service"

        # Push to registry if configured
        if [ -n "${REGISTRY}" ]; then
            print_info "Pushing ${service} to registry..."
            docker push "${image_name}:${VERSION}"
            docker push "${image_name}:latest"
        fi
    else
        print_error "Failed to build ${service} service"
        return 1
    fi
}

# Build base image first
build_base() {
    local image_name="${REGISTRY}graphql-microservices-builder"

    print_step "Building base/builder image..."

    BUILD_ARGS=(
        --build-arg BUILD_DATE="${BUILD_DATE}"
        --build-arg VCS_REF="${VCS_REF}"
        --build-arg VERSION="${VERSION}"
        --target service-builder
    )

    if [ -n "${REGISTRY}" ]; then
        BUILD_ARGS+=(--cache-from "${image_name}:latest")
    fi

    # Add progress output
    BUILD_ARGS+=(--progress=plain)

    if docker build \
        -f "Dockerfile.base" \
        -t "${image_name}:${VERSION}" \
        -t "${image_name}:latest" \
        "${BUILD_ARGS[@]}" \
        .; then
        print_info "Successfully built base/builder image"

        if [ -n "${REGISTRY}" ]; then
            print_info "Pushing base/builder to registry..."
            docker push "${image_name}:${VERSION}"
            docker push "${image_name}:latest"
        fi
    else
        print_error "Failed to build base/builder image"
        return 1
    fi
}

# Parallel build function
parallel_build() {
    local pids=()

    # Build services in parallel
    for service in "${SERVICES[@]}"; do
        build_service "${service}" &
        pids+=($!)
    done

    # Wait for all builds to complete
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            failed=$((failed + 1))
        fi
    done

    return $failed
}

# Main execution
print_info "Starting production build process..."
print_info "Version: ${VERSION}"
print_info "Build Date: ${BUILD_DATE}"
print_info "VCS Ref: ${VCS_REF}"
print_info "Services found: ${SERVICES[*]}"

if [ -n "${REGISTRY}" ]; then
    print_info "Registry: ${REGISTRY}"
else
    print_warn "No registry configured. Images will only be built locally."
fi

# Build base image first (required by all services)
if ! build_base; then
    print_error "Base image build failed. Aborting."
    exit 1
fi

# Build all services
if [ "${PARALLEL_BUILD:-true}" = "true" ]; then
    print_info "Building services in parallel..."
    if parallel_build; then
        print_info "All services built successfully!"
    else
        print_error "Some services failed to build"
        exit 1
    fi
else
    print_info "Building services sequentially..."
    for service in "${SERVICES[@]}"; do
        if ! build_service "${service}"; then
            print_error "Build process failed"
            exit 1
        fi
    done
fi

# Generate docker compose override file with image tags
cat > docker-compose.override.yml <<EOF
# Auto-generated file - DO NOT EDIT
# Generated on ${BUILD_DATE}
# Version: ${VERSION}
version: '3.9'

services:
  builder:
    image: ${REGISTRY}graphql-microservices-builder:${VERSION}
EOF

for service in "${SERVICES[@]}"; do
    cat >> docker-compose.override.yml <<EOF
  ${service}:
    image: ${REGISTRY}graphql-microservices-${service}:${VERSION}
EOF
done

print_info "Generated docker-compose.override.yml with image tags"

# Optionally run tests
if [ "${RUN_TESTS:-false}" = "true" ]; then
    print_info "Running integration tests..."
    docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from tests
fi

# Print summary
echo ""
print_info "Build Summary:"
print_info "- Base/Builder image: ${REGISTRY}graphql-microservices-builder:${VERSION}"
for service in "${SERVICES[@]}"; do
    print_info "- ${service^} service: ${REGISTRY}graphql-microservices-${service}:${VERSION}"
done

print_info "Build process completed successfully!"
