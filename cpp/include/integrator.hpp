#pragma once

#include <Eigen/Core>

#include <vector>

// 追踪结果：轨迹点 + 每个点的场强大小
struct FieldLine {
    std::vector<Eigen::Vector3d> points;   // 轨迹点
    std::vector<double> strengths;         // 对应点的 |B|
};

// RK4 单步：沿磁场方向前进步长 ds
Eigen::Vector3d rk4Step(const Eigen::Vector3d& pos, double ds);

// 从起点沿磁场方向追踪最多 maxSteps 步。
// 遇到 |B| 过小或超出 maxRadius 计算区域时提前终止。
FieldLine traceLine(const Eigen::Vector3d& start,
                    double stepSize,
                    int maxSteps,
                    double maxRadius = 10.0);
