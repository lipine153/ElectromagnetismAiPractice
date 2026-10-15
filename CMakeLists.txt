cmake_minimum_required(VERSION 3.28)

project(field_line LANGUAGES CXX)

# 只能用 Emscripten 工具链配置（见 scripts/build.ps1）
if(NOT EMSCRIPTEN)
    message(FATAL_ERROR
        "此目标必须用 Emscripten 构建。请用 scripts/build.ps1，"
        "或手动执行: emcmake cmake -S . -B build -G Ninja")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# 不依赖 Eigen：场计算只需要简单向量运算（cpp/include/vec3.hpp）
add_executable(field_line
    cpp/src/field.cpp
    cpp/src/integrator.cpp
    cpp/src/bindings.cpp
)

target_include_directories(field_line PRIVATE cpp/include)

target_compile_options(field_line PRIVATE -Wall -Wextra)

# Wasm 导出契约：与 src/physics/wasm.ts 保持一致
target_link_options(field_line PRIVATE
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_set_sources','_trace_lines','_eval_field']"
    "-sEXPORTED_RUNTIME_METHODS=['getValue']"
    -sALLOW_MEMORY_GROWTH=1
    -sMODULARIZE=1
    -sEXPORT_NAME=FieldLineModule
    -sEXPORT_ALL=1
)

# 产物落到 public/bin/，Vite 会原样 serve/拷贝，simulate.ts 用 ./bin/field_line.js 引用
set_target_properties(field_line PROPERTIES
    OUTPUT_NAME field_line
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/public/bin"
)
