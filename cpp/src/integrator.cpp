#include "integrator.hpp"

#include "field.hpp"

Eigen::Vector3d rk4Step(const Eigen::Vector3d& pos, double ds) {
    Eigen::Vector3d k1 = getMagneticField(pos).normalized();
    Eigen::Vector3d k2 = getMagneticField(pos + 0.5 * ds * k1).normalized();
    Eigen::Vector3d k3 = getMagneticField(pos + 0.5 * ds * k2).normalized();
    Eigen::Vector3d k4 = getMagneticField(pos + ds * k3).normalized();
    return pos + (ds / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4);
}

FieldLine traceLine(const Eigen::Vector3d& start,
                    double stepSize,
                    int maxSteps,
                    double maxRadius) {
    FieldLine line;
    line.points.reserve(maxSteps);
    line.strengths.reserve(maxSteps);

    Eigen::Vector3d current = start;
    for (int i = 0; i < maxSteps; ++i) {
        Eigen::Vector3d b = getMagneticField(current);
        double bNorm = b.norm();
        if (bNorm < 1e-8) break;

        line.points.push_back(current);
        line.strengths.push_back(bNorm);

        current = rk4Step(current, stepSize);
        // 超出计算区域就终止
        if (current.norm() > maxRadius) break;
    }
    return line;
}
