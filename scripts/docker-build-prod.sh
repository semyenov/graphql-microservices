#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Configuration
REGISTRY=${REGISTRY:-""}
VERSION=${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "latest")}
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

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

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Services to build
SERVICES=("gateway" "users" "products" "orders")

# Build function
build_service() {
    local service=$1
    local image_name="${REGISTRY}graphql-microservices-${service}"
    
    print_info "Building ${service} service..."
    
    # Build arguments
    BUILD_ARGS=(
        --build-arg BUILD_DATE="${BUILD_DATE}"
        --build-arg VCS_REF="${VCS_REF}"
        --build-arg VERSION="${VERSION}"
    )
    
    # Build with cache
    if [ -n "${REGISTRY}" ]; then
        BUILD_ARGS+=(--cache-from "${image_name}:latest")
    fi
    
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

# Main execution
print_info "Starting production build process..."
print_info "Version: ${VERSION}"
print_info "Build Date: ${BUILD_DATE}"
print_info "VCS Ref: ${VCS_REF}"

if [ -n "${REGISTRY}" ]; then
    print_info "Registry: ${REGISTRY}"
else
    print_warn "No registry configured. Images will only be built locally."
fi

# Build all services
for service in "${SERVICES[@]}"; do
    if ! build_service "${service}"; then
        print_error "Build process failed"
        exit 1
    fi
done

print_info "All services built successfully!"

# Generate docker-compose override file with image tags
cat > docker-compose.override.yml <<EOF
# Auto-generated file - DO NOT EDIT
# Generated on ${BUILD_DATE}
version: '3.9'

services:
  gateway:
    image: ${REGISTRY}graphql-microservices-gateway:${VERSION}
  users:
    image: ${REGISTRY}graphql-microservices-users:${VERSION}
  products:
    image: ${REGISTRY}graphql-microservices-products:${VERSION}
  orders:
    image: ${REGISTRY}graphql-microservices-orders:${VERSION}
EOF

print_info "Generated docker-compose.override.yml with image tags"

# Optionally run tests
if [ "${RUN_TESTS:-false}" = "true" ]; then
    print_info "Running integration tests..."
    docker-compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from tests
fi

print_info "Build process completed successfully!"