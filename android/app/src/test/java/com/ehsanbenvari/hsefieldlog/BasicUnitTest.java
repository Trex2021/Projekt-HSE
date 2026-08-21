package com.ehsanbenvari.hsefieldlog;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class BasicUnitTest {
    @Test
    public void versionLabelMatchesPackageVersion() {
        assertEquals("1.6.2", BuildConfig.VERSION_NAME);
        assertEquals(20, BuildConfig.VERSION_CODE);
    }
}
