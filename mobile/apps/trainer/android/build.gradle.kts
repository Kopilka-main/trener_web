allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
    // file_picker → flutter_plugin_android_lifecycle требует compileSdk 36. App-модуль
    // поднят до 36 явно, но плагин-субпроекты наследуют дефолт Flutter (34) — поэтому
    // принудительно поднимаем compileSdk у всех Android-субпроектов. Регистрируем
    // afterEvaluate здесь, ДО evaluationDependsOn ниже (иначе субпроект уже эвалюирован).
    afterEvaluate {
        extensions.findByName("android")?.withGroovyBuilder {
            "compileSdkVersion"(36)
        }
    }
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
