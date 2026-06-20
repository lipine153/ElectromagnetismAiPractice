# ===================== 配置项 =====================
CC := emcc

SRC_DIR := ./cpp
BIN_DIR := ./bin
EIGEN_DIR := D:/Dev/Lib/eigen-5.0.0

TARGET := $(BIN_DIR)/field_line.js
SRCS := $(SRC_DIR)/main.cpp

# ===================== 编译参数 =====================
CFLAGS := -O3 -msimd128 -I $(EIGEN_DIR) -Wall
LDFLAGS := \
  -s "EXPORTED_FUNCTIONS=['_malloc','_free','_traceFieldLine','_freeFieldLine']" \
  -s "EXPORTED_RUNTIME_METHODS=['getValue']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="FieldLineModule" \
  -s EXPORT_ALL=1

# ===================== 构建规则 =====================
.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SRCS)
	@if not exist $(BIN_DIR) md $(BIN_DIR)
	$(CC) $^ -o $@ $(CFLAGS) $(LDFLAGS)
