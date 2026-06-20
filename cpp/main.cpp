#include <Eigen/Core>
#include <vector>
#include <cmath>
#include <emscripten.h>

using Eigen::Vector3d;

// ===================== 你可替换为自己的场计算函数 =====================
// 输入空间点，返回该点的磁感应强度矢量（示例：磁偶极子场）
Vector3d getMagneticField(Vector3d pos) {
    double r = pos.norm();
    if (r < 1e-3) return Vector3d::Zero();
    
    Vector3d m(0.0, 0.0, 1.0); // 磁偶极矩沿z轴
    double r5 = std::pow(r, 5);
    double r3 = std::pow(r, 3);
    return (3.0 * pos * (m.dot(pos)) / r5 - m / r3);
}
// ====================================================================

// RK4 单步积分：沿磁场方向前进步长 ds
Vector3d rk4Step(Vector3d pos, double ds) {
    Vector3d k1 = getMagneticField(pos).normalized();
    Vector3d k2 = getMagneticField(pos + 0.5 * ds * k1).normalized();
    Vector3d k3 = getMagneticField(pos + 0.5 * ds * k2).normalized();
    Vector3d k4 = getMagneticField(pos + ds * k3).normalized();
    return pos + (ds / 6.0) * (k1 + 2*k2 + 2*k3 + k4);
}

// 对外导出：追踪一条磁力线，返回 float 数组指针
// 输出格式：每个点占 4 个 float → x, y, z, 场强大小
extern "C" EMSCRIPTEN_KEEPALIVE
float* traceFieldLine(double start_x, double start_y, double start_z,
                      double step_size, int max_steps, int* out_point_count)
{
    std::vector<Vector3d> linePoints;
    std::vector<double> fieldStrengths;
    linePoints.reserve(max_steps);
    fieldStrengths.reserve(max_steps);

    Vector3d current(start_x, start_y, start_z);
    for (int i = 0; i < max_steps; ++i) {
        Vector3d b = getMagneticField(current);
        double bNorm = b.norm();
        if (bNorm < 1e-8) break;

        linePoints.push_back(current);
        fieldStrengths.push_back(bNorm);

        current = rk4Step(current, step_size);
        // 超出计算区域就终止
        if (current.norm() > 10.0) break;
    }

    int pointCount = linePoints.size();
    *out_point_count = pointCount;

    // 分配连续内存（JS 可直接读取），每个点 4 个 float
    float* buffer = (float*)malloc(pointCount * 4 * sizeof(float));
    for (int i = 0; i < pointCount; ++i) {
        buffer[i*4 + 0] = (float)linePoints[i].x();
        buffer[i*4 + 1] = (float)linePoints[i].y();
        buffer[i*4 + 2] = (float)linePoints[i].z();
        buffer[i*4 + 3] = (float)fieldStrengths[i];
    }
    return buffer;
}

// 对外导出：释放 Wasm 内存
extern "C" EMSCRIPTEN_KEEPALIVE
void freeFieldLine(float* ptr) {
    free(ptr);
}