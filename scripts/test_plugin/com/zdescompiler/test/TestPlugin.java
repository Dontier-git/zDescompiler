package com.zdescompiler.test;

import java.util.logging.Logger;

public class TestPlugin {
    private static final String VERSION = "1.0.0";
    private final Logger logger;

    public TestPlugin() {
        this.logger = Logger.getLogger("TestPlugin");
    }

    public String getVersion() {
        return VERSION;
    }

    public void onEnable() {
        logger.info("TestPlugin v" + VERSION + " enabled!");
        String msg = "Hello, Minecraft!";
        System.out.println(msg);
    }

    public int calculate(int a, int b) {
        int sum = a + b;
        if (sum > 100) {
            return 100;
        }
        return sum;
    }
}
