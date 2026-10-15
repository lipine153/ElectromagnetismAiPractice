#include "field.hpp"

#include <cmath>

// 示例场：沿 z 轴的磁偶极子
Eigen::Vector3d getMagneticField(const Eigen::Vector3d& pos) {
    double r = pos.norm();
    if (r < 1e-3) return Eigen::Vector3d::Zero();

    Eigen::Vector3d m(0.0, 0.0, 1.0); // 磁偶极矩沿 z 轴
    double r5 = std::pow(r, 5);
    double r3 = std::pow(r, 3);
    return 3.0 * pos * (m.dot(pos)) / r5 - m / r3;
}
