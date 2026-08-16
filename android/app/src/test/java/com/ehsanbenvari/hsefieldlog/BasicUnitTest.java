package com.ehsanbenvari.hsefieldlog;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class BasicUnitTest {
    @Test
    public void versionLabelMatchesPackageVersion() {
        assertEquals("1.3.1", BuildConfig.VERSION_NAME);
        assertEquals(15, BuildConfig.VERSION_CODE);
    }
}
