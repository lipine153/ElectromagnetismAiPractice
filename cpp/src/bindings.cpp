#include "integrator.hpp"

#include <emscripten.h>

#include <cstdlib>

// 对外导出：追踪一条磁力线，返回 float 数组指针
// 输出格式：每个点占 4 个 float -> x, y, z, 场强大小
extern "C" EMSCRIPTEN_KEEPALIVE
float* traceFieldLine(double start_x, double start_y, double start_z,
                      double step_size, int max_steps, int* out_point_count) {
    FieldLine line = traceLine(Eigen::Vector3d(start_x, start_y, start_z),
                               step_size, max_steps);

    const int pointCount = static_cast<int>(line.points.size());
    *out_point_count = pointCount;

    // 分配连续内存（JS 可直接读取），每个点 4 个 float
    float* buffer = static_cast<float*>(std::malloc(pointCount * 4 * sizeof(float)));
    for (int i = 0; i < pointCount; ++i) {
        buffer[i * 4 + 0] = static_cast<float>(line.points[i].x());
        buffer[i * 4 + 1] = static_cast<float>(line.points[i].y());
        buffer[i * 4 + 2] = static_cast<float>(line.points[i].z());
        buffer[i * 4 + 3] = static_cast<float>(line.strengths[i]);
    }
    return buffer;
}

// 对外导出：释放 Wasm 内存
extern "C" EMSCRIPTEN_KEEPALIVE
void freeFieldLine(float* ptr) {
    std::free(ptr);
}
