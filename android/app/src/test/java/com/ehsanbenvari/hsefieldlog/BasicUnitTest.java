package com.ehsanbenvari.hsefieldlog;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class BasicUnitTest {
    @Test
    public void versionLabelMatchesPackageVersion() {
        assertEquals("1.5.0", BuildConfig.VERSION_NAME);
        assertEquals(17, BuildConfig.VERSION_CODE);
    }
}
