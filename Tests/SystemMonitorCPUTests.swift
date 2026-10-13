// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Darwin
import Foundation

/// Runs the production CPU reader against scripted host tick counters.
enum SystemMonitorCPUTests {
    class Fixture {
        var previousCPUTicks: (sample: CPUTickSample, time: TimeInterval)?
        var lastCPUUsage: Double?
        var lastCPUUsageReadAt: TimeInterval?
        var lastCPUShares: CPUShareReading?
        var ticks: (user: UInt32, system: UInt32, idle: UInt32, nice: UInt32) = (0, 0, 0, 0)
        func host_statistics(_ host: host_t, _ flavor: host_flavor_t, _ info: host_info_t,
                             _ count: UnsafeMutablePointer<mach_msg_type_number_t>) -> kern_return_t {
            info.withMemoryRebound(to: host_cpu_load_info.self, capacity: 1) {
                $0.pointee.cpu_ticks = (ticks.user, ticks.system, ticks.idle, ticks.nice)
            }
            return KERN_SUCCESS
        }
    }

    static func run(_ suite: TestSuite) {
        let monitor = Monitor()
        monitor.ticks = (100, 100, 800, 0)
        suite.expect(monitor.readCPUUsage(now: 0) == nil, "the first CPU read only sets a baseline")
        monitor.ticks = (200, 200, 1_400, 0)
        let steady = CPUShareReading(user: 0.125, system: 0.125, idle: 0.75, nice: 0, used: 0.25)
        suite.expect(monitor.readCPUUsage(now: 5) == steady, "a regular CPU read is the busy share since the last one")
        monitor.lastCPUUsage = steady.used
        monitor.lastCPUUsageReadAt = 5
        monitor.lastCPUShares = steady
        monitor.ticks = (1_200, 1_200, 1_600, 0)
        suite.expect(monitor.readCPUUsage(now: 65) == nil,
                     "a CPU read after a long gap only resets the baseline instead of reporting the gap's average")
        suite.expect(monitor.lastCPUUsage == nil && monitor.lastCPUUsageReadAt == nil && monitor.lastCPUShares == nil,
                     "a CPU read after a long gap drops the value and read time held from before the gap")
        monitor.ticks = (1_300, 1_300, 1_800, 0)
        let resumed = CPUShareReading(user: 0.25, system: 0.25, idle: 0.5, nice: 0, used: 0.5)
        suite.expect(monitor.readCPUUsage(now: 70) == resumed, "sampling resumes from the reset baseline")
    }
}
