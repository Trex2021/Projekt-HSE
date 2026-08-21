package com.ehsanbenvari.hsefieldlog;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class BasicUnitTest {
    @Test
    public void versionLabelMatchesPackageVersion() {
        assertEquals("1.6.0", BuildConfig.VERSION_NAME);
        assertEquals(18, BuildConfig.VERSION_CODE);
    }
}
